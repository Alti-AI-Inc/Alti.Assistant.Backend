import { describe, it, expect, vi, beforeEach } from 'vitest';
import forumUserActivitiesValidationSchema from './forum.validation'; // Assuming test file is in the same directory

// Mock dependencies
const mockMongoose = {
  Types: {
    ObjectId: {
      isValid: vi.fn(),
    },
  },
};

const mockCategoryValues = ['Tech', 'Science', 'Art', 'Gaming', 'Lifestyle'];

vi.mock('mongoose', () => mockMongoose);
vi.mock('./forum.constant', () => ({ // Assuming forum.constant is in the same directory
  categoryValues: mockCategoryValues,
}));

describe('forumUserActivitiesValidationSchema', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockMongoose.Types.ObjectId.isValid.mockClear();
    // Default to valid ObjectId for most tests unless specifically testing invalid
    mockMongoose.Types.ObjectId.isValid.mockReturnValue(true);
  });

  // Helper to generate a valid ObjectId string
  const generateValidObjectId = () => '60c728b29b1d4e001c8e4d1a';

  const validForumActivityBody = {
    title: 'A Comprehensive Guide to Modern Web Development',
    img: 'https://example.com/webdev-guide.jpg',
    category: 'Tech',
    author: generateValidObjectId(),
    authorEmail: 'developer.expert@example.com',
    description: [
      {
        title: 'Introduction to Frontend Frameworks',
        content1: 'Exploring React, Vue, and Angular basics.',
        content2: 'Comparing their ecosystems and use cases.',
      },
      {
        title: 'Backend with Node.js and Express',
        content1: 'Setting up a robust API with authentication.',
        content2: 'Database integration with MongoDB.',
      },
    ],
    createdAt: new Date('2023-01-01T10:00:00Z'),
    updatedAt: new Date('2023-01-01T10:00:00Z'),
  };

  // --- Overall Schema Validation ---
  it('should validate a complete and valid forum activity object', () => {
    const result = forumUserActivitiesValidationSchema.safeParse({ body: validForumActivityBody });
    expect(result.success).toBe(true);
    expect(result.data.body).toEqual(expect.objectContaining({
      title: validForumActivityBody.title,
      img: validForumActivityBody.img,
      category: validForumActivityBody.category,
      author: validForumActivityBody.author,
      authorEmail: validForumActivityBody.authorEmail,
      description: expect.arrayContaining([
        expect.objectContaining({ title: 'Introduction to Frontend Frameworks' }),
        expect.objectContaining({ title: 'Backend with Node.js and Express' }),
      ]),
      createdAt: validForumActivityBody.createdAt,
      updatedAt: validForumActivityBody.updatedAt,
    }));
  });

  it('should set createdAt and updatedAt defaults if not provided in the body', () => {
    const { createdAt, updatedAt, ...restBody } = validForumActivityBody;
    const result = forumUserActivitiesValidationSchema.safeParse({ body: restBody });
    expect(result.success).toBe(true);
    expect(result.data.body.createdAt).toBeInstanceOf(Date);
    expect(result.data.body.updatedAt).toBeInstanceOf(Date);
    // Check that default dates are recent (within a reasonable timeframe, e.g., 1 second)
    const now = new Date();
    expect(result.data.body.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(result.data.body.updatedAt.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(result.data.body.createdAt.getTime()).toBeGreaterThan(now.getTime() - 1000); // Within 1 second
    expect(result.data.body.updatedAt.getTime()).toBeGreaterThan(now.getTime() - 1000); // Within 1 second
  });

  it('should fail if the top-level object does not contain a "body" property', () => {
    const result = forumUserActivitiesValidationSchema.safeParse(validForumActivityBody); // Pass body directly
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body']);
  });

  // --- Title Validation ---
  it('should fail if title is too short', () => {
    const invalidBody = { ...validForumActivityBody, title: 'ab' };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('String must contain at least 3 character(s)');
    expect(result.error.issues[0].path).toEqual(['body', 'title']);
  });

  it('should fail if title is too long', () => {
    const invalidBody = { ...validForumActivityBody, title: 'a'.repeat(101) };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('String must contain at most 100 character(s)');
    expect(result.error.issues[0].path).toEqual(['body', 'title']);
  });

  it('should fail if title is missing', () => {
    const { title, ...restBody } = validForumActivityBody;
    const result = forumUserActivitiesValidationSchema.safeParse({ body: restBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'title']);
  });

  // --- Image Validation ---
  it('should fail if img is an empty string (whitespace only)', () => {
    const invalidBody = { ...validForumActivityBody, img: '   ' };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Forum image is required');
    expect(result.error.issues[0].path).toEqual(['body', 'img']);
  });

  it('should fail if img is an empty string', () => {
    const invalidBody = { ...validForumActivityBody, img: '' };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Forum image is required');
    expect(result.error.issues[0].path).toEqual(['body', 'img']);
  });

  it('should fail if img is missing', () => {
    const { img, ...restBody } = validForumActivityBody;
    const result = forumUserActivitiesValidationSchema.safeParse({ body: restBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'img']);
  });

  // --- Category Validation ---
  it('should fail if category is not in categoryValues', () => {
    const invalidBody = { ...validForumActivityBody, category: 'InvalidCategory' };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Invalid category');
    expect(result.error.issues[0].path).toEqual(['body', 'category']);
  });

  it('should fail if category is missing', () => {
    const { category, ...restBody } = validForumActivityBody;
    const result = forumUserActivitiesValidationSchema.safeParse({ body: restBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'category']);
  });

  // --- Author Validation ---
  it('should fail if author is an invalid ObjectId', () => {
    mockMongoose.Types.ObjectId.isValid.mockReturnValue(false);
    const invalidBody = { ...validForumActivityBody, author: 'invalid-id-format' };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Invalid author ID');
    expect(result.error.issues[0].path).toEqual(['body', 'author']);
    expect(mockMongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('invalid-id-format');
  });

  it('should fail if author is missing', () => {
    const { author, ...restBody } = validForumActivityBody;
    const result = forumUserActivitiesValidationSchema.safeParse({ body: restBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'author']);
  });

  // --- Author Email Validation ---
  it('should fail if authorEmail is not a valid email', () => {
    const invalidBody = { ...validForumActivityBody, authorEmail: 'invalid-email-format' };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Please provide a valid email');
    expect(result.error.issues[0].path).toEqual(['body', 'authorEmail']);
  });

  it('should fail if authorEmail is missing', () => {
    const { authorEmail, ...restBody } = validForumActivityBody;
    const result = forumUserActivitiesValidationSchema.safeParse({ body: restBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'authorEmail']);
  });

  // --- Description Validation ---
  it('should fail if description is missing', () => {
    const { description, ...restBody } = validForumActivityBody;
    const result = forumUserActivitiesValidationSchema.safeParse({ body: restBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'description']);
  });

  it('should fail if description is not an array', () => {
    const invalidBody = { ...validForumActivityBody, description: 'not an array' };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Expected array, received string');
    expect(result.error.issues[0].path).toEqual(['body', 'description']);
  });

  it('should fail if description array contains objects with missing title', () => {
    const invalidBody = {
      ...validForumActivityBody,
      description: [{ content1: 'a', content2: 'b' }], // Missing title
    };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'description', 0, 'title']);
  });

  it('should fail if description array contains objects with missing content1', () => {
    const invalidBody = {
      ...validForumActivityBody,
      description: [{ title: 't', content2: 'b' }], // Missing content1
    };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'description', 0, 'content1']);
  });

  it('should fail if description array contains objects with missing content2', () => {
    const invalidBody = {
      ...validForumActivityBody,
      description: [{ title: 't', content1: 'a' }], // Missing content2
    };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Required');
    expect(result.error.issues[0].path).toEqual(['body', 'description', 0, 'content2']);
  });

  // --- createdAt/updatedAt Refinement ---
  it('should fail if updatedAt is before createdAt', () => {
    const invalidBody = {
      ...validForumActivityBody,
      createdAt: new Date('2023-01-02T10:00:00Z'),
      updatedAt: new Date('2023-01-01T10:00:00Z'),
    };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: invalidBody });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('updatedAt must be greater than or equal to createdAt');
    expect(result.error.issues[0].path).toEqual(['body']); // Refinement is on the body object itself
  });

  it('should pass if updatedAt is equal to createdAt', () => {
    const validBody = {
      ...validForumActivityBody,
      createdAt: new Date('2023-01-01T10:00:00Z'),
      updatedAt: new Date('2023-01-01T10:00:00Z'),
    };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: validBody });
    expect(result.success).toBe(true);
  });

  it('should pass if updatedAt is after createdAt', () => {
    const validBody = {
      ...validForumActivityBody,
      createdAt: new Date('2023-01-01T10:00:00Z'),
      updatedAt: new Date('2023-01-02T10:00:00Z'),
    };
    const result = forumUserActivitiesValidationSchema.safeParse({ body: validBody });
    expect(result.success).toBe(true);
  });
});