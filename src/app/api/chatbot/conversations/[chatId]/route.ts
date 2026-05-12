import { GET as getChatThread } from "../../../chat/threads/[chatId]/route";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ chatId: string }> },
) {
  const response = await getChatThread(request, context);
  response.headers.set("Deprecation", "true");
  response.headers.set("Link", '</api/chat/threads/{chatId}>; rel="successor-version"');
  return response;
}
