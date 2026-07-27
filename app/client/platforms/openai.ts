"use client";
// azure and openai, using same models. so using same LLMApi.
import {
  ApiPath,
  OPENAI_BASE_URL,
  DEFAULT_MODELS,
  OpenaiPath,
  Azure,
  REQUEST_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS_FOR_THINKING,
  ServiceProvider,
} from "@/app/constant";
import {
  ChatMessageTool,
  useAccessStore,
  useAppConfig,
  useChatStore,
  usePluginStore,
} from "@/app/store";
import { collectModelsWithDefaultModel } from "@/app/utils/model";
import {
  preProcessImageContent,
  uploadImage,
  base64Image2Blob,
  streamWithThink,
} from "@/app/utils/chat";
import {
  AUTO_IMAGE_MODEL,
  isImageIntentCandidate,
  parseImageIntent,
  type ImageIntent,
} from "@/app/utils/image-generation";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { ModelSize, DalleQuality, DalleStyle } from "@/app/typing";

import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  MultimodalContent,
  SpeechOptions,
} from "../api";
import Locale from "../../locales";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  getMessageImages,
  isVisionModel,
  supportsReasoningEffort,
  isDalle3 as _isDalle3,
  getTimeoutMSByModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";
import { ReasoningEffort } from "@/app/utils/reasoning";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

export interface RequestPayload {
  messages: {
    role: "developer" | "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
  stream?: boolean;
  model: string;
  temperature: number;
  presence_penalty: number;
  frequency_penalty: number;
  top_p: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: ReasoningEffort;
}

export interface DalleRequestPayload {
  model: string;
  prompt: string;
  response_format: "url" | "b64_json";
  n: number;
  size: ModelSize;
  quality: DalleQuality;
  style: DalleStyle;
}

export class ChatGPTApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    const isAzure = path.includes("deployments");
    if (accessStore.useCustomConfig) {
      if (isAzure && !accessStore.isValidAzure()) {
        throw Error(
          "incomplete azure config, please check it in your settings page",
        );
      }

      baseUrl = isAzure ? accessStore.azureUrl : accessStore.openaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = isAzure ? ApiPath.Azure : ApiPath.OpenAI;
      baseUrl = isApp ? OPENAI_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (
      !baseUrl.startsWith("http") &&
      !isAzure &&
      !baseUrl.startsWith(ApiPath.OpenAI)
    ) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    // try rebuild url, when using cloudflare ai gateway in client
    return cloudflareAIGatewayUrl([baseUrl, path].join("/"));
  }

  async extractMessage(res: any) {
    if (res.error) {
      return "```\n" + JSON.stringify(res, null, 4) + "\n```";
    }
    // dalle3 model return url, using url create image message
    if (res.data) {
      let url = res.data?.at(0)?.url ?? "";
      const b64_json = res.data?.at(0)?.b64_json ?? "";
      if (!url && b64_json) {
        // uploadImage
        url = await uploadImage(base64Image2Blob(b64_json, "image/png"));
      }
      return [
        {
          type: "image_url",
          image_url: {
            url,
          },
        },
      ];
    }
    return res.choices?.at(0)?.message?.content ?? res;
  }

  private getLatestImageUrl(messages: ChatOptions["messages"]): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const images = getMessageImages(messages[i]);
      if (images.length > 0 && images[0]) return images[0];
    }
    return "";
  }

  private async detectImageIntent(
    options: ChatOptions,
    modelConfig: any,
    sourceImageUrl: string,
  ): Promise<ImageIntent> {
    if (modelConfig.enableImageGeneration === false) return "chat";

    const latestUserMessage = [...options.messages]
      .reverse()
      .find((message) => message.role === "user");
    const latestUserText = latestUserMessage
      ? getMessageTextContent(latestUserMessage)
      : "";
    if (!isImageIntentCandidate(latestUserText, Boolean(sourceImageUrl))) {
      return "chat";
    }

    const context = options.messages.slice(-6).map((message) => ({
      role: message.role,
      content: getMessageTextContent(message),
    }));
    const classifierModel =
      modelConfig.model === AUTO_IMAGE_MODEL
        ? "gpt-5.6-terra"
        : modelConfig.model;

    try {
      const response = await fetch(this.path(OpenaiPath.ChatPath), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          model: classifierModel,
          stream: false,
          temperature: 0,
          max_completion_tokens: 16,
          messages: [
            {
              role: "system",
              content:
                "Classify the user's latest request in this chat. Reply with exactly one word: generate (create a new image), edit (modify an attached or previously generated image), or chat (everything else). Do not explain.",
            },
            ...context,
          ],
        }),
      });
      if (!response.ok) return "chat";
      const payload = await response.json();
      return parseImageIntent(payload?.choices?.[0]?.message?.content);
    } catch (error) {
      console.warn("[Image Generation] intent classifier unavailable", error);
      return "chat";
    }
  }

  async speech(options: SpeechOptions): Promise<ArrayBuffer> {
    const requestPayload = {
      model: options.model,
      input: options.input,
      voice: options.voice,
      response_format: options.response_format,
      speed: options.speed,
    };

    console.log("[Request] openai speech payload: ", requestPayload);

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const speechPath = this.path(OpenaiPath.SpeechPath);
      const speechPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const res = await fetch(speechPath, speechPayload);
      clearTimeout(requestTimeoutId);
      return await res.arrayBuffer();
    } catch (e) {
      console.log("[Request] failed to make a speech request", e);
      throw e;
    }
  }

  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    let requestPayload: RequestPayload | DalleRequestPayload;

    const sourceImageUrl = this.getLatestImageUrl(options.messages);
    const imageIntent = await this.detectImageIntent(
      options,
      modelConfig,
      sourceImageUrl,
    );
    const isAutoImageRequest = imageIntent !== "chat";
    const isDalle3 = _isDalle3(options.config.model);
    const isImageRequest = isDalle3 || isAutoImageRequest;
    const imageModel = isAutoImageRequest
      ? AUTO_IMAGE_MODEL
      : options.config.model;
    const isImageEdit = isAutoImageRequest && imageIntent === "edit";
    let imageEditBody: FormData | undefined;
    const isO1OrO3 =
      options.config.model.startsWith("o1") ||
      options.config.model.startsWith("o3") ||
      options.config.model.startsWith("o4-mini");
    if (isImageRequest) {
      const prompt = getMessageTextContent(
        options.messages.slice(-1)?.pop() as any,
      );
      if (isImageEdit) {
        if (!sourceImageUrl) {
          options.onError?.(
            new Error("No image is available in this conversation to edit."),
          );
          return;
        }
        const imageResponse = await fetch(sourceImageUrl, {
          credentials: "include",
        });
        if (!imageResponse.ok) {
          options.onError?.(
            new Error("The source image is no longer available for editing."),
          );
          return;
        }
        const image = await imageResponse.blob();
        imageEditBody = new FormData();
        imageEditBody.append("image", image, "source-image.png");
        imageEditBody.append("model", imageModel);
        imageEditBody.append("prompt", prompt);
        imageEditBody.append("response_format", "b64_json");
        requestPayload = {} as DalleRequestPayload;
      } else {
        requestPayload = {
          model: imageModel,
          prompt,
          // URLs are only valid for 60 minutes after the image has been generated.
          response_format: "b64_json", // using b64_json, and save image in CacheStorage
          n: 1,
          size: options.config?.size ?? "1024x1024",
          // gpt-image-2 rejects the DALL·E-only `style` parameter.
          // Keep these controls for explicit DALL·E 3 requests only.
          ...(isDalle3
            ? {
                quality: options.config?.quality ?? "standard",
                style: options.config?.style ?? "vivid",
              }
            : {}),
        } as DalleRequestPayload;
      }
    } else {
      const visionModel = isVisionModel(options.config.model);
      const messages: ChatOptions["messages"] = [];
      for (const v of options.messages) {
        const content = visionModel
          ? await preProcessImageContent(v.content)
          : getMessageTextContent(v);
        if (!(isO1OrO3 && v.role === "system"))
          messages.push({ role: v.role, content });
      }

      // O1 not support image, tools (plugin in ChatGPTNextWeb) and system, stream, logprobs, temperature, top_p, n, presence_penalty, frequency_penalty yet.
      requestPayload = {
        messages,
        stream: options.config.stream,
        model: modelConfig.model,
        temperature: !isO1OrO3 ? modelConfig.temperature : 1,
        presence_penalty: !isO1OrO3 ? modelConfig.presence_penalty : 0,
        frequency_penalty: !isO1OrO3 ? modelConfig.frequency_penalty : 0,
        top_p: !isO1OrO3 ? modelConfig.top_p : 1,
        // max_tokens: Math.max(modelConfig.max_tokens, 1024),
        // Please do not ask me why not send max_tokens, no reason, this param is just shit, I dont want to explain anymore.
      };

      if (isO1OrO3) {
        // by default the o1/o3 models will not attempt to produce output that includes markdown formatting
        // manually add "Formatting re-enabled" developer message to encourage markdown inclusion in model responses
        // (https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/reasoning?tabs=python-secure#markdown-output)
        requestPayload["messages"].unshift({
          role: "developer",
          content: "Formatting re-enabled",
        });

        // o1/o3 uses max_completion_tokens to control the number of tokens (https://platform.openai.com/docs/guides/reasoning#controlling-costs)
        requestPayload["max_completion_tokens"] = modelConfig.max_tokens;
      }

      if (supportsReasoningEffort(modelConfig.model)) {
        requestPayload["reasoning_effort"] = modelConfig.reasoning_effort;
      }

      // add max_tokens to vision model
      if (visionModel && !isO1OrO3) {
        requestPayload["max_tokens"] = Math.max(modelConfig.max_tokens, 4000);
      }
    }

    console.log("[Request] openai payload: ", requestPayload);

    const shouldStream = !isImageRequest && !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      let chatPath = "";
      if (modelConfig.providerName === ServiceProvider.Azure) {
        // find model, and get displayName as deployName
        const { models: configModels, customModels: configCustomModels } =
          useAppConfig.getState();
        const {
          defaultModel,
          customModels: accessCustomModels,
          useCustomConfig,
        } = useAccessStore.getState();
        const models = collectModelsWithDefaultModel(
          configModels,
          [configCustomModels, accessCustomModels].join(","),
          defaultModel,
        );
        const model = models.find(
          (model) =>
            model.name === modelConfig.model &&
            model?.provider?.providerName === ServiceProvider.Azure,
        );
        chatPath = this.path(
          (isImageRequest ? Azure.ImagePath : Azure.ChatPath)(
            (model?.displayName ?? model?.name) as string,
            useCustomConfig ? useAccessStore.getState().azureApiVersion : "",
          ),
        );
      } else {
        chatPath = this.path(
          isImageEdit
            ? OpenaiPath.ImageEditPath
            : isImageRequest
            ? OpenaiPath.ImagePath
            : OpenaiPath.ChatPath,
        );
      }
      if (imageEditBody) {
        const imageHeaders = getHeaders(true);
        imageHeaders.Accept = "application/json";
        const res = await fetch(chatPath, {
          method: "POST",
          body: imageEditBody,
          signal: controller.signal,
          headers: imageHeaders,
        });
        const message = await this.extractMessage(await res.json());
        options.onFinish(message, res);
      } else if (shouldStream) {
        let index = -1;
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        // console.log("getAsTools", tools, funcs);
        streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          tools as any,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const json = JSON.parse(text);
            const choices = json.choices as Array<{
              delta: {
                content: string;
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
              };
            }>;

            if (!choices?.length) return { isThinking: false, content: "" };

            const tool_calls = choices[0]?.delta?.tool_calls;
            if (tool_calls?.length > 0) {
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                index += 1;
                runTools.push({
                  id,
                  type: tool_calls[0]?.type,
                  function: {
                    name: tool_calls[0]?.function?.name as string,
                    arguments: args,
                  },
                });
              } else {
                // @ts-ignore
                runTools[index]["function"]["arguments"] += args;
              }
            }

            const reasoning = choices[0]?.delta?.reasoning_content;
            const content = choices[0]?.delta?.content;

            // Skip if both content and reasoning_content are empty or null
            if (
              (!reasoning || reasoning.length === 0) &&
              (!content || content.length === 0)
            ) {
              return {
                isThinking: false,
                content: "",
              };
            }

            if (reasoning && reasoning.length > 0) {
              return {
                isThinking: true,
                content: reasoning,
              };
            } else if (content && content.length > 0) {
              return {
                isThinking: false,
                content: content,
              };
            }

            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // reset index value
            index = -1;
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
        );
      } else {
        const chatPayload = {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          headers: getHeaders(),
        };

        // Image generation/editing can legitimately outlast the normal chat timeout.
        // Reuse the existing long-running request budget (five minutes).
        const requestTimeoutMs = isImageRequest
          ? REQUEST_TIMEOUT_MS_FOR_THINKING
          : getTimeoutMSByModel(options.config.model);
        const requestTimeoutId = setTimeout(
          () => controller.abort(),
          requestTimeoutMs,
        );

        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = await this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = formatDate(startOfMonth);
    const endDate = formatDate(new Date(Date.now() + ONE_DAY));

    const [used, subs] = await Promise.all([
      fetch(
        this.path(
          `${OpenaiPath.UsagePath}?start_date=${startDate}&end_date=${endDate}`,
        ),
        {
          method: "GET",
          headers: getHeaders(),
        },
      ),
      fetch(this.path(OpenaiPath.SubsPath), {
        method: "GET",
        headers: getHeaders(),
      }),
    ]);

    if (used.status === 401) {
      throw new Error(Locale.Error.Unauthorized);
    }

    if (!used.ok || !subs.ok) {
      throw new Error("Failed to query usage from openai");
    }

    const response = (await used.json()) as {
      total_usage?: number;
      error?: {
        type: string;
        message: string;
      };
    };

    const total = (await subs.json()) as {
      hard_limit_usd?: number;
    };

    if (response.error && response.error.type) {
      throw Error(response.error.message);
    }

    if (response.total_usage) {
      response.total_usage = Math.round(response.total_usage) / 100;
    }

    if (total.hard_limit_usd) {
      total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
    }

    return {
      used: response.total_usage,
      total: total.hard_limit_usd,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    if (this.disableListModels) {
      return DEFAULT_MODELS.slice();
    }

    const res = await fetch(this.path(OpenaiPath.ListModelPath), {
      method: "GET",
      headers: {
        ...getHeaders(),
      },
    });

    const resJson = (await res.json()) as OpenAIListModelResponse;
    const chatModels = resJson.data?.filter(
      (m) => m.id.startsWith("gpt-") || m.id.startsWith("chatgpt-"),
    );
    console.log("[Models]", chatModels);

    if (!chatModels) {
      return [];
    }

    //由于目前 OpenAI 的 disableListModels 默认为 true，所以当前实际不会运行到这场
    let seq = 1000; //同 Constant.ts 中的排序保持一致
    return chatModels.map((m) => ({
      name: m.id,
      available: true,
      sorted: seq++,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        providerType: "openai",
        sorted: 1,
      },
    }));
  }
}
export { OpenaiPath };
