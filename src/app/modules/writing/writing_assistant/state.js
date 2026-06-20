export const writingAssistantState = {
  initialTopic: { value: null },
  writingBrief: { value: (x, y) => y, default: () => '' },
  questions: { value: null },
  history: { value: (x, y) => x.concat(y), default: () => [] },
  userInput: { value: null },
  finalContent: { value: null },
  responseMessage: { value: null },
  selectedAgent: { value: (x, y) => y || x, default: () => null },
  selectedStyle: { value: (x, y) => y || x, default: () => null },
  selectedPurpose: { value: (x, y) => y || x, default: () => null },
  isSwarm: { value: (x, y) => (y !== undefined ? y : x), default: () => false },
};
