import type { ToolResultOutput } from "@ai-sdk/provider-utils";
import type {
  FlexibleSchema,
  ModelMessage,
  Tool,
  ToolExecutionOptions,
  ToolSet,
} from "ai";
import { tool } from "ai";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import type { ProviderOptions } from "../validators.js";
import type { Agent } from "./index.js";

const MIGRATION_URL = "node_modules/@convex-dev/agent/MIGRATION.md";
const warnedDeprecations = new Set<string>();
function warnDeprecation(key: string, message: string) {
  if (!warnedDeprecations.has(key)) {
    warnedDeprecations.add(key);
    console.warn(`[@convex-dev/agent] ${message}\n  See: ${MIGRATION_URL}`);
  }
}

export type ToolCtx<DataModel extends GenericDataModel = GenericDataModel> =
  GenericActionCtx<DataModel> & {
    agent?: Agent;
    userId?: string;
    threadId?: string;
    messageId?: string;
    promptMessageId?: string;
  };

type ApprovalEditMetadata = {
  approvalId: string;
  editNote: string;
};

/**
 * Function that is called to determine if the tool needs approval before it can be executed.
 */
export type ToolNeedsApprovalFunctionCtx<
  INPUT,
  Ctx extends ToolCtx = ToolCtx,
> = (
  ctx: Ctx,
  input: INPUT,
  options: {
    /**
     * The ID of the tool call. You can use it e.g. when sending tool-call related information with stream data.
     */
    toolCallId: string;
    /**
     * Messages that were sent to the language model to initiate the response that contained the tool call.
     * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
     */
    messages: ModelMessage[];
    /**
     * Additional context.
     *
     * Experimental (can break in patch releases).
     */
    experimental_context?: unknown;
  },
) => boolean | PromiseLike<boolean>;

export type ToolExecuteFunctionCtx<
  INPUT,
  OUTPUT,
  Ctx extends ToolCtx = ToolCtx,
> = (
  ctx: Ctx,
  input: INPUT,
  options: ToolExecutionOptions,
) => AsyncIterable<OUTPUT> | PromiseLike<OUTPUT>;

type NeverOptional<N, T> = 0 extends 1 & N
  ? Partial<T>
  : [N] extends [never]
    ? Partial<Record<keyof T, undefined>>
    : T;

/**
 * Error message type for deprecated 'handler' property.
 * Using a string literal type causes TypeScript to show this message in errors.
 */
type HANDLER_REMOVED_ERROR =
  "⚠️ 'handler' was removed in @convex-dev/agent v0.6.0. Rename to 'execute'. See: node_modules/@convex-dev/agent/MIGRATION.md";

export type ToolOutputPropertiesCtx<
  INPUT,
  OUTPUT,
  Ctx extends ToolCtx = ToolCtx,
> = NeverOptional<
  OUTPUT,
  {
    /**
     * An async function that is called with the arguments from the tool call and produces a result.
     * If `execute` is not provided, the tool will not be executed automatically.
     *
     * @param input - The input of the tool call.
     * @param options.abortSignal - A signal that can be used to abort the tool call.
     */
    execute?: ToolExecuteFunctionCtx<INPUT, OUTPUT, Ctx>;
    outputSchema?: FlexibleSchema<OUTPUT>;
    /**
     * @deprecated Removed in v0.6.0. Use `execute` instead.
     */
    handler?: HANDLER_REMOVED_ERROR;
  }
>;

/**
 * Error message type for deprecated 'args' property.
 * Using a string literal type causes TypeScript to show this message in errors.
 */
type ARGS_REMOVED_ERROR =
  "⚠️ 'args' was removed in @convex-dev/agent v0.6.0. Rename to 'inputSchema'. See: node_modules/@convex-dev/agent/MIGRATION.md";

export type ToolInputProperties<INPUT> = {
  /**
   * The schema of the input that the tool expects.
   * The language model will use this to generate the input.
   * It is also used to validate the output of the language model.
   *
   * You can use descriptions on the schema properties to make the input understandable for the language model.
   */
  inputSchema: FlexibleSchema<INPUT>;
  /**
   * @deprecated Removed in v0.6.0. Use `inputSchema` instead.
   */
  args?: ARGS_REMOVED_ERROR;
};

/**
 * This is a wrapper around the ai.tool function that adds extra context to the
 * tool call, including the action context, userId, threadId, and messageId.
 * @param tool The tool. See https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 * Currently contains deprecated parameters `args` and `handler` to maintain backwards compatibility
 * but these will be removed in the future. Use `inputSchema` and `execute` instead, respectively.
 * 
 * @returns A tool to be used with the AI SDK.
 */
export function createTool<INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx>(
  def: {
    /**
     * An optional description of what the tool does.
     * Will be used by the language model to decide whether to use the tool.
     * Not used for provider-defined tools.
     */
    description?: string;
    /**
     * An optional title of the tool.
     */
    title?: string;
    /**
     * Additional provider-specific metadata. They are passed through
     * to the provider from the AI SDK and enable provider-specific
     * functionality that can be fully encapsulated in the provider.
     */
    providerOptions?: ProviderOptions;
  } & ToolInputProperties<INPUT> & {
      /**
       * An optional list of input examples that show the language
       * model what the input should look like.
       */
      inputExamples?: Array<{
        input: NoInfer<INPUT>;
      }>;
      /**
       * Whether the tool needs approval before it can be executed.
       */
      needsApproval?:
        | boolean
        | ToolNeedsApprovalFunctionCtx<
            [INPUT] extends [never] ? unknown : INPUT,
            Ctx
          >;
      /**
       * Strict mode setting for the tool.
       *
       * Providers that support strict mode will use this setting to determine
       * how the input should be generated. Strict mode will always produce
       * valid inputs, but it might limit what input schemas are supported.
       */
      strict?: boolean;
      /**
       * Provide the context to use, e.g. when defining the tool at runtime.
       */
      ctx?: Ctx;
      /**
       * Optional function that is called when the argument streaming starts.
       * Only called when the tool is used in a streaming context.
       */
      onInputStart?: (
        ctx: Ctx,
        options: ToolExecutionOptions,
      ) => void | PromiseLike<void>;
      /**
       * Optional function that is called when an argument streaming delta is available.
       * Only called when the tool is used in a streaming context.
       */
      onInputDelta?: (
        ctx: Ctx,
        options: { inputTextDelta: string } & ToolExecutionOptions,
      ) => void | PromiseLike<void>;
      /**
       * Optional function that is called when a tool call can be started,
       * even if the execute function is not provided.
       */
      onInputAvailable?: (
        ctx: Ctx,
        options: {
          input: [INPUT] extends [never] ? unknown : INPUT;
        } & ToolExecutionOptions,
      ) => void | PromiseLike<void>;
    } & ToolOutputPropertiesCtx<INPUT, OUTPUT, Ctx> & {
      /**
       * Optional conversion function that maps the tool result to an output that can be used by the language model.
       *
       * If not provided, the tool result will be sent as a JSON object.
       */
      toModelOutput?: (
        ctx: Ctx,
        options: {
          /**
           * The ID of the tool call. You can use it e.g. when sending tool-call related information with stream data.
           */
          toolCallId: string;
          /**
           * The input of the tool call.
           */
          input: [INPUT] extends [never] ? unknown : INPUT;
          /**
           * The output of the tool call.
           */
          output: 0 extends 1 & OUTPUT
            ? any
            : [OUTPUT] extends [never]
              ? any
              : NoInfer<OUTPUT>;
        },
      ) => ToolResultOutput | PromiseLike<ToolResultOutput>;
    },
): Tool<INPUT, OUTPUT> {
  // Runtime backwards compat - types will show errors but runtime still works
  const inputSchema = def.inputSchema ?? (def as any).args;
  if (!inputSchema)
    throw new Error("To use a Convex tool, you must provide an `inputSchema`");

  if ((def as any).args && !def.inputSchema) {
    warnDeprecation(
      "createTool.args",
      "createTool: 'args' is deprecated. Use 'inputSchema' instead.",
    );
  }
  if ((def as any).handler && !def.execute) {
    warnDeprecation(
      "createTool.handler",
      "createTool: 'handler' is deprecated. Use 'execute' instead.",
    );
  }

  const executeHandler = def.execute ?? (def as any).handler;
  if (!executeHandler && !def.outputSchema)
    throw new Error(
      "To use a Convex tool, you must either provide an execute" +
        " handler function, define an outputSchema, or both",
    );

  const approvalEditMetadataByToolCallId = new Map<string, ApprovalEditMetadata>();

  const t = tool<INPUT, OUTPUT>({
    type: "function",
    __acceptsCtx: true,
    ctx: def.ctx,
    description: def.description,
    title: def.title,
    providerOptions: def.providerOptions,
    inputSchema,
    inputExamples: def.inputExamples,
    needsApproval(this: Tool<INPUT, OUTPUT>, input, options) {
      const needsApproval = def.needsApproval;
      if (!needsApproval || typeof needsApproval === "boolean")
        return Boolean(needsApproval);

      if (!getCtx(this)) {
        throw new Error(
          "To use a Convex tool, you must either provide the ctx" +
            " at definition time (dynamically in an action), or use the Agent to" +
            " call it (which injects the ctx, userId and threadId)",
        );
      }
      return needsApproval(getCtx(this), input, options);
    },
    strict: def.strict,
    ...(executeHandler
      ? {
          async execute(
            this: Tool<INPUT, OUTPUT>,
            input: INPUT,
            options: ToolExecutionOptions,
          ) {
            const ctx = getCtx(this);
            if (!ctx) {
              throw new Error(
                "To use a Convex tool, you must either provide the ctx" +
                  " at definition time (dynamically in an action), or use the Agent to" +
                  " call it (which injects the ctx, userId and threadId)",
              );
            }
            const approvalEditMetadata =
              await getApprovalEditMetadataForToolCall(
                ctx,
                options.toolCallId,
              ).catch((error) => {
                console.warn(
                  "[@convex-dev/agent] Failed to resolve approval edit metadata",
                  error,
                );
                return undefined;
              });
            if (approvalEditMetadata) {
              approvalEditMetadataByToolCallId.set(
                options.toolCallId,
                approvalEditMetadata,
              );
            }
            return (await executeHandler(ctx, input, options)) as any;
          },
        }
      : {}),
    outputSchema: def.outputSchema,
  });
  if (def.onInputStart) {
    const origOnInputStart = def.onInputStart;
    t.onInputStart = function (this: Tool<INPUT, OUTPUT>, options) {
      return origOnInputStart.call(this, getCtx(this), options);
    };
  }
  if (def.onInputDelta) {
    const origOnInputDelta = def.onInputDelta;
    t.onInputDelta = function (this: Tool<INPUT, OUTPUT>, options) {
      return origOnInputDelta.call(this, getCtx(this), options);
    };
  }
  if (def.onInputAvailable) {
    const origOnInputAvailable = def.onInputAvailable;
    t.onInputAvailable = function (this: Tool<INPUT, OUTPUT>, options) {
      return origOnInputAvailable.call(this, getCtx(this), options);
    };
  }
  const origToModelOutput = def.toModelOutput;
  t.toModelOutput = async function (
    this: Tool<INPUT, OUTPUT>,
    options,
  ): Promise<ToolResultOutput> {
    const baseOutput = origToModelOutput
      ? await origToModelOutput.call(this, getCtx(this), options)
      : defaultToolResultOutput(options.output);
    const approvalEditMetadata = approvalEditMetadataByToolCallId.get(
      options.toolCallId,
    );
    if (!approvalEditMetadata) {
      return baseOutput;
    }
    approvalEditMetadataByToolCallId.delete(options.toolCallId);
    return augmentToolResultOutputWithApprovalEdit(
      baseOutput,
      approvalEditMetadata,
    );
  };
  return t;
}

function getCtx<Ctx extends ToolCtx>(tool: any): Ctx {
  return (tool as { ctx: Ctx }).ctx;
}

function defaultToolResultOutput(output: unknown): ToolResultOutput {
  if (isToolResultOutput(output)) {
    return output;
  }
  if (typeof output === "string") {
    return {
      type: "text",
      value: output,
    };
  }
  return {
    type: "json",
    value: (output ?? null) as any,
  };
}

function isToolResultOutput(output: unknown): output is ToolResultOutput {
  if (!output || typeof output !== "object") {
    return false;
  }
  const type = (output as { type?: unknown }).type;
  return (
    type === "text" ||
    type === "json" ||
    type === "execution-denied" ||
    type === "error-text" ||
    type === "error-json" ||
    type === "content"
  );
}

function buildApprovalEditMetadataText(metadata: ApprovalEditMetadata): string {
  return [
    "Approval edit metadata: the user edited this tool's configuration before approving execution.",
    metadata.editNote,
  ].join("\n");
}

function augmentToolResultOutputWithApprovalEdit(
  output: ToolResultOutput,
  metadata: ApprovalEditMetadata,
): ToolResultOutput {
  const noteText = buildApprovalEditMetadataText(metadata);
  switch (output.type) {
    case "text":
      return {
        ...output,
        value: `${noteText}\n\n${output.value}`,
      };
    case "json":
      if (
        output.value !== null &&
        typeof output.value === "object" &&
        !Array.isArray(output.value)
      ) {
        return {
          ...output,
          value: {
            approvalEdit: {
              approvalId: metadata.approvalId,
              editedBeforeApproval: true,
              note: metadata.editNote,
            },
            ...(output.value as Record<string, unknown>),
          } as any,
        };
      }
      return {
        type: "text",
        value: `${noteText}\n\n${JSON.stringify(output.value)}`,
        providerOptions: output.providerOptions,
      };
    case "content":
      return {
        type: "content",
        value: [{ type: "text", text: noteText }, ...output.value],
      };
    case "execution-denied":
    case "error-text":
    case "error-json":
      return output;
  }
}

async function getApprovalEditMetadataForToolCall(
  ctx: ToolCtx,
  toolCallId: string,
): Promise<ApprovalEditMetadata | undefined> {
  const promptMessageId =
    typeof ctx.promptMessageId === "string" && ctx.promptMessageId.trim().length > 0
      ? ctx.promptMessageId
      : typeof ctx.messageId === "string" && ctx.messageId.trim().length > 0
        ? ctx.messageId
        : undefined;
  if (!ctx.agent || !ctx.threadId || !promptMessageId) {
    return undefined;
  }

  const messagesPage = await ctx.runQuery(
    ctx.agent.component.messages.listMessagesByThreadId as any,
    {
      threadId: ctx.threadId,
      upToAndIncludingMessageId: promptMessageId,
      order: "desc",
      paginationOpts: {
        cursor: null,
        numItems: 100,
      },
    },
  );
  const page = Array.isArray((messagesPage as any)?.page)
    ? ((messagesPage as any).page as Array<{
        _id?: string;
        message?: { content?: unknown };
      }>)
    : [];
  if (page.length === 0) {
    return undefined;
  }

  const approvalResponseMessage =
    page.find((message) => message?._id === promptMessageId) ??
    page.find((message) =>
      Array.isArray(message?.message?.content)
        ? (message.message!.content as unknown[]).some(
            (part) => (part as { type?: unknown }).type === "tool-approval-response",
          )
        : false,
    );
  const responseContent = Array.isArray(approvalResponseMessage?.message?.content)
    ? (approvalResponseMessage!.message!.content as unknown[])
    : [];
  if (responseContent.length === 0) {
    return undefined;
  }

  const approvalNotesById = new Map<string, ApprovalEditMetadata>();
  for (const part of responseContent) {
    if ((part as { type?: unknown }).type !== "tool-approval-response") {
      continue;
    }
    const approvalId =
      typeof (part as { approvalId?: unknown }).approvalId === "string"
        ? ((part as { approvalId: string }).approvalId as string)
        : undefined;
    const approved = (part as { approved?: unknown }).approved === true;
    const editNote =
      typeof (part as { editNote?: unknown }).editNote === "string"
        ? (part as { editNote: string }).editNote.trim()
        : "";
    if (!approvalId || !approved || editNote.length === 0) {
      continue;
    }
    approvalNotesById.set(approvalId, {
      approvalId,
      editNote,
    });
  }
  if (approvalNotesById.size === 0) {
    return undefined;
  }

  const toolCallIdByApprovalId = new Map<string, string>();
  for (const message of page) {
    const content = Array.isArray(message?.message?.content)
      ? (message!.message!.content as unknown[])
      : [];
    for (const part of content) {
      if ((part as { type?: unknown }).type !== "tool-approval-request") {
        continue;
      }
      const approvalId =
        typeof (part as { approvalId?: unknown }).approvalId === "string"
          ? ((part as { approvalId: string }).approvalId as string)
          : undefined;
      const requestToolCallId =
        typeof (part as { toolCallId?: unknown }).toolCallId === "string"
          ? ((part as { toolCallId: string }).toolCallId as string)
          : undefined;
      if (!approvalId || !requestToolCallId) {
        continue;
      }
      toolCallIdByApprovalId.set(approvalId, requestToolCallId);
    }
  }

  for (const [approvalId, metadata] of approvalNotesById.entries()) {
    if (toolCallIdByApprovalId.get(approvalId) === toolCallId) {
      return metadata;
    }
  }

  return undefined;
}

export function wrapTools(
  ctx: ToolCtx,
  ...toolSets: (ToolSet | undefined)[]
): ToolSet {
  const output = {} as ToolSet;
  for (const toolSet of toolSets) {
    if (!toolSet) {
      continue;
    }
    for (const [name, tool] of Object.entries(toolSet)) {
      if (tool && !(tool as any).__acceptsCtx) {
        output[name] = tool;
      } else {
        const out = { ...tool, ctx };
        output[name] = out;
      }
    }
  }
  return output;
}
