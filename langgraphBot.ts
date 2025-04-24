import { TeamsActivityHandler, TurnContext } from "botbuilder";
import readline from "readline";

const LANGGRAPH_API_KEY = "app-XXXXXXXXXXXXXXXXXXX";
const LANGGRAPH_BASE_URL = "https://api.dify.ai/v1";

const conversationDB = {};

export class LangGraphBot extends TeamsActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context, next) => {
      console.log("Running with Message Activity.");
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
