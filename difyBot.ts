import { TeamsActivityHandler, TurnContext } from "botbuilder";
import readline from "readline";

const DIFY_API_KEY = "app-XXXXXXXXXXXXXXXXXXX";
const DIFY_BASE_URL = "https://api.dify.ai/v1";

const conversationDB = {};

export class DifyBot extends TeamsActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context, next) => {
      console.log("Running with Message Activity.");

      const { ChatClient } = await import("dify-client");
      const chatClient = new ChatClient(DIFY_API_KEY, DIFY_BASE_URL);
      const removedMentionText = TurnContext.removeRecipientMention(
        context.activity
      );
      const txt = removedMentionText.toLowerCase().replace(/\n|\r/g, "").trim();

      if (txt === "clear") {
        conversationDB[context.activity.from.id] = null;
        await context.sendActivity("대화를 초기화했습니다.");
        return;
      }

      try {
        // 타이핑 인디케이터 표시
        await context.sendActivity({ type: "typing" });

        const response = await chatClient.createChatMessage(
          {},
          txt,
          "user",
          true,
          conversationDB[context.activity.from.id],
          null
        );

        // 응답 데이터 처리
        let responseText = "";
        const rl = readline.createInterface({
          input: response.data,
        });
        let buffer = "";

        // 타이핑 인디케이터를 주기적으로 보내기 위한 타이머 설정
        const typingInterval = setInterval(async () => {
          await context.sendActivity({ type: "typing" });
        }, 2000); // 2초마다 타이핑 인디케이터 전송

        // Create a promise to handle stream completion
        await new Promise<void>((resolve) => {
          rl.on("line", (line) => {
            if (line.startsWith("data:")) {
              buffer += line.slice(5).trim();
            } else if (line === "") {
              // End of one message
              if (buffer) {
                try {
                  const data = JSON.parse(buffer);
                  // console.log("🔥", data);

                  switch (data.event) {
                    case "message":
                      responseText += data.answer;
                      break;
                    case "agent_message":
                      responseText += data.answer;
                      break;
                    case "message_end":
                      // resolve();
                      conversationDB[context.activity.from.id] =
                        data.conversation_id;
                      break;
                    case "agent_thought":
                      // console.log("💭", data);
                      break;
                    default:
                      break;
                  }
                } catch (err) {
                  console.log("Non-JSON SSE event:", buffer);
                }
                buffer = "";
              }
            }
          });

          rl.on("close", () => {
            console.log("SSE connection closed.");
            clearInterval(typingInterval); // 타이머 정리
            resolve();
          });
        });
        console.log(responseText || "응답을 받지 못했습니다.");
        // Send response after stream is complete
        await context.sendActivity(responseText || "응답을 받지 못했습니다.");
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
            `안녕하세요! 저는 Dify 봇입니다. 무엇이든 질문해주세요.`
          );
          break;
        }
      }
      await next();
    });
  }
}
