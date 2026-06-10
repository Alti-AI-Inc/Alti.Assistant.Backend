import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSampleTemplates } from './sampleTemplates.js';
import WorkflowTemplate from './models/workflowTemplate.model.js';
import { logger } from '../../../shared/logger.js';

// Mock the dependencies
vi.mock('./models/workflowTemplate.model.js', () => {
  const mockSave = vi.fn().mockResolvedValue(true);
  const MockWorkflowTemplate = vi.fn().mockImplementation(data => ({
    ...data,
    save: mockSave,
  }));
  MockWorkflowTemplate.findOne = vi.fn();
  return { default: MockWorkflowTemplate };
});

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// The sampleTemplates array has 4 templates. We'll use this count in tests.
const TEMPLATE_COUNT = 4;

describe('createSampleTemplates', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create all sample templates if the database is empty', async () => {
    // Arrange: Mock findOne to return null, indicating no templates exist
    WorkflowTemplate.findOne.mockResolvedValue(null);

    // Act
    await createSampleTemplates();

    // Assert
    expect(logger.info).toHaveBeenCalledWith('Creating sample workflow templates...');
    expect(WorkflowTemplate.findOne).toHaveBeenCalledTimes(TEMPLATE_COUNT);
    expect(WorkflowTemplate).toHaveBeenCalledTimes(TEMPLATE_COUNT); // constructor calls
    const mockSave = new WorkflowTemplate().save;
    expect(mockSave).toHaveBeenCalledTimes(TEMPLATE_COUNT);

    expect(logger.info).toHaveBeenCalledWith('Created template: Daily Stock Price Email');
    expect(logger.info).toHaveBeenCalledWith('Created template: Social Media Cross-Posting');
    expect(logger.info).toHaveBeenCalledWith('Created template: Weekly Expense Report');
    expect(logger.info).toHaveBeenCalledWith('Created template: Task Reminder System');
    expect(logger.info).toHaveBeenCalledWith('Sample templates creation completed');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should not create templates that already exist', async () => {
    // Arrange: Mock findOne to return an existing template for the first two, and null for the rest
    WorkflowTemplate.findOne
      .mockResolvedValueOnce({ name: 'Daily Stock Price Email' })
      .mockResolvedValueOnce({ name: 'Social Media Cross-Posting' })
      .mockResolvedValue(null);

    // Act
    await createSampleTemplates();

    // Assert
    expect(logger.info).toHaveBeenCalledWith('Creating sample workflow templates...');
    expect(WorkflowTemplate.findOne).toHaveBeenCalledTimes(TEMPLATE_COUNT);

    // Only 2 new templates should be created
    expect(WorkflowTemplate).toHaveBeenCalledTimes(2);
    const mockSave = new WorkflowTemplate().save;
    expect(mockSave).toHaveBeenCalledTimes(2);

    // Check logs for existing templates
    expect(logger.info).toHaveBeenCalledWith('Template already exists: Daily Stock Price Email');
    expect(logger.info).toHaveBeenCalledWith('Template already exists: Social Media Cross-Posting');

    // Check logs for created templates
    expect(logger.info).toHaveBeenCalledWith('Created template: Weekly Expense Report');
    expect(logger.info).toHaveBeenCalledWith('Created template: Task Reminder System');

    expect(logger.info).toHaveBeenCalledWith('Sample templates creation completed');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should not create any templates if all of them already exist', async () => {
    // Arrange: Mock findOne to always return an existing template
    WorkflowTemplate.findOne.mockImplementation(query =>
      Promise.resolve({ name: query.name })
    );

    // Act
    await createSampleTemplates();

    // Assert
    expect(logger.info).toHaveBeenCalledWith('Creating sample workflow templates...');
    expect(WorkflowTemplate.findOne).toHaveBeenCalledTimes(TEMPLATE_COUNT);

    // No new templates should be created
    expect(WorkflowTemplate).not.toHaveBeenCalled();
    const mockSave = new WorkflowTemplate().save;
    expect(mockSave).not.toHaveBeenCalled();

    // Check logs for existing templates
    expect(logger.info).toHaveBeenCalledWith('Template already exists: Daily Stock Price Email');
    expect(logger.info).toHaveBeenCalledWith('Template already exists: Social Media Cross-Posting');
    expect(logger.info).toHaveBeenCalledWith('Template already exists: Weekly Expense Report');
    expect(logger.info).toHaveBeenCalledWith('Template already exists: Task Reminder System');

    expect(logger.info).toHaveBeenCalledWith('Sample templates creation completed');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should handle and re-throw errors from WorkflowTemplate.findOne', async () => {
    // Arrange
    const dbError = new Error('Database connection failed');
    WorkflowTemplate.findOne.mockRejectedValue(dbError);

    // Act & Assert
    await expect(createSampleTemplates()).rejects.toThrow(dbError);

    expect(logger.info).toHaveBeenCalledWith('Creating sample workflow templates...');
    expect(logger.error).toHaveBeenCalledWith('Error creating sample templates:', dbError);
    expect(logger.info).not.toHaveBeenCalledWith('Sample templates creation completed');
  });

  it('should handle and re-throw errors from template.save', async () => {
    // Arrange
    const saveError = new Error('Failed to save document');
    WorkflowTemplate.findOne.mockResolvedValue(null); // No templates exist
    const mockSave = new WorkflowTemplate().save;
    mockSave.mockRejectedValue(saveError); // Mock save to fail

    // Act & Assert
    await expect(createSampleTemplates()).rejects.toThrow(saveError);

    expect(logger.info).toHaveBeenCalledWith('Creating sample workflow templates...');
    expect(WorkflowTemplate.findOne).toHaveBeenCalledTimes(1); // Fails on the first one
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error creating sample templates:', saveError);
    expect(logger.info).not.toHaveBeenCalledWith('Sample templates creation completed');
  });
});