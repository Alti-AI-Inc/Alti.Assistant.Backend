export const writingAssistantState = {
  initialTopic: { value: null },
  writingBrief: { value: (x, y) => y, default: () => "" },
  questions: { value: null },
  history: { value: (x, y) => x.concat(y), default: () => [] },
  userInput: { value: null },
  finalContent: { value: null },
  responseMessage: { value: null },
};
