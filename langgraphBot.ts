import { MessageFactory, TeamsActivityHandler, TurnContext } from "botbuilder";
import { Client, DefaultValues } from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";

const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY;
const LANGGRAPH_ENDPOINT = process.env.LANGGRAPH_ENDPOINT;
const LANGGRAPH_ASSISTANT_ID = process.env.LANGGRAPH_ASSISTANT_ID;

const client = new Client({
  apiKey: LANGGRAPH_API_KEY,
  apiUrl: LANGGRAPH_ENDPOINT,
});

// Store conversation threads
const threadsDB: Record<string, string> = {};

export class LangGraphBot extends TeamsActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context, next) => {
      console.log("Running with Message Activity.");

      const removedMentionText = TurnContext.removeRecipientMention(
        context.activity
      );
      const query = removedMentionText
        .toLowerCase()
        .replace(/\n|\r/g, "")
        .trim();

      if (query === "clear") {
        delete threadsDB[context.activity.from.id];
        await context.sendActivity("대화를 초기화했습니다.");
        return;
      }

      try {
        // Show typing indicator
        await context.sendActivity({ type: "typing" });

        // Get or create thread ID
        let threadId = threadsDB[context.activity.from.id];

        // Create new thread if it doesn't exist
        if (!threadId) {
          const thread = await client.threads.create({
            metadata: {
              user_id: context.activity.from.id,
            },
          });
          threadId = thread.thread_id;
          threadsDB[context.activity.from.id] = threadId;
        }

        // Process file attachments
        const files = (context.activity.attachments ?? [])
          .filter((attachment) =>
            attachment.contentType.startsWith(
              "application/vnd.microsoft.teams.file.download.info"
            )
          )
          .map((attachment) => ({
            type: "image_url",
            image_url: {
              url: attachment.content.downloadUrl,
            },
          }));

        // Create human message
        const newHumanMessage = {
          id: uuidv4(),
          type: "human",
          content: [
            {
              type: "text",
              text: query,
            },
            ...files,
          ],
        };

        // Get response from LangGraph
        const response: any = await client.runs.wait(
          threadId,
          LANGGRAPH_ASSISTANT_ID,
          {
            input: {
              messages: [newHumanMessage],
            },
            metadata: {
              user_id: context.activity.from.id,
            },
            config: {
              configurable: {
                model: "openai/gpt-4o",
              },
            },
          }
        );

        // Get the last message content
        const answer = response.messages[response.messages.length - 1].content;

        // Send response
        await context.sendActivity(answer);
      } catch (error) {
        console.error("Error:", error);
        await context.sendActivity(
          "죄송합니다. 응답을 처리하는 중에 오류가 발생했습니다."
        );
      }

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      for (let cnt = 0; cnt < membersAdded.length; cnt++) {
        if (membersAdded[cnt].id) {
          await context.sendActivity(
            `안녕하세요! 저는 LangGraph 봇입니다. 무엇이든 질문해주세요.`
          );
          break;
        }
      }
      await next();
    });
  }
}
