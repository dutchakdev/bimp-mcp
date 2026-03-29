export function getPrompts(): Array<{
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}> {
  return [];
}

export function handleGetPrompt(
  _name: string,
  _args?: Record<string, string>
): { messages: Array<{ role: string; content: { type: string; text: string } }> } {
  return { messages: [] };
}
