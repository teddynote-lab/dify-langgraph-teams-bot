import { MessageFactory, TeamsActivityHandler, TurnContext } from "botbuilder";
import readline from "readline";

const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_ENDPOINT = process.env.DIFY_ENDPOINT;

// File category extensions mapping
const DIFY_FILE_CATEGORY_EXTENSIONS: Record<string, string[]> = {
  document: [
    // Document file extensions
    "TXT",
    "MD",
    "MDX",
    "MARKDOWN",
    "PDF",
    "HTML",
    "XLSX",
    "XLS",
    "DOC",
    "DOCX",
    "CSV",
    "EML",
    "MSG",
    "PPTX",
    "PPT",
    "XML",
    "EPUB",
  ],
  image: ["JPG", "JPEG", "PNG", "GIF", "WEBP", "SVG"], // Image file extensions
  audio: ["MP3", "M4A", "WAV", "WEBM", "AMR", "MPGA"], // Audio file extensions
  video: ["MP4", "MOV", "MPEG", "MPGA"], // Video file extensions
};

const conversationDB = {};

export class DifyBot extends TeamsActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context, next) => {
      console.log("Running with Message Activity.");

      const { ChatClient } = await import("dify-client");
      const chatClient = new ChatClient(DIFY_API_KEY, DIFY_ENDPOINT);
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

        // 첨부 파일을 Dify 파일 형식으로 변환
        const files = context.activity.attachments
          .filter((attachment) =>
            attachment.contentType.startsWith(
              "application/vnd.microsoft.teams.file.download.info"
            )
          )
          .map((attachment) => ({
            type: this.get_dify_file_category(attachment.name),
            url: attachment.content.downloadUrl,
            transfer_method: "remote_url",
          }));

        // Dify API 요청
        const response = await chatClient.createChatMessage(
          {},
          txt,
          context.activity.from.id,
          true,
          conversationDB[context.activity.from.id],
          files as unknown as File[]
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

        // 응답 파일 목록 초기화
        const responseFiles = [];

        // 응답 스트림 처리
        await new Promise<void>((resolve) => {
          rl.on("line", async (line) => {
            if (line.startsWith("data:")) {
              buffer += line.slice(5).trim();
            } else if (line === "") {
              // End of one message
              if (buffer) {
                try {
                  const data = JSON.parse(buffer);

                  switch (data.event) {
                    case "message":
                      responseText += data.answer;
                      break;
                    case "agent_message":
                      responseText += data.answer;
                      break;
                    case "message_end":
                      conversationDB[context.activity.from.id] =
                        data.conversation_id;
                      break;
                    case "message_file":
                      responseFiles.push({
                        url: data.url,
                        type: data.type,
                      });
                      break;
                    case "agent_thought":
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

        // 스트림 완료 후 응답 메세지 제작
        const reply = MessageFactory.text(responseText);
        if (responseFiles.length > 0) {
          // 응답 파일 첨부
          reply.attachments = responseFiles.map((file) => {
            return {
              contentType:
                file.type + new URL(file.url).pathname.split(".").pop(),
              contentUrl: file.url,
            };
          });
        }

        // 응답 메세지 전송
        await context.sendActivity(reply);
      } catch (error) {
        // 오류 처리
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

  get_dify_file_category(filename: string): string {
    const extension = filename.split(".").pop()?.toUpperCase() || "";

    for (const [category, extensions] of Object.entries(
      DIFY_FILE_CATEGORY_EXTENSIONS
    )) {
      if (extensions.includes(extension)) {
        return category;
      }
    }
    return "custom";
  }
}
