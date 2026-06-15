import { describe, it, expect, vi, beforeEach } from 'vitest';
import moment from 'moment';
import { purchasePlanTemplate } from './payment.utils.js';

const {
  mockFormat
} = vi.hoisted(() => {
  // Mock the moment library to ensure deterministic date formatting in tests
  // This setup allows us to control the output of moment().format()
  const mockFormat = vi.fn();

  return {
    mockFormat
  };
});
vi.mock('moment', () => ({
  default: vi.fn().mockImplementation(() => ({
    format: mockFormat,
  })),
}));

describe('payment.utils', () => {
  beforeEach(() => {
    // Reset mocks before each test to ensure test isolation
    vi.clearAllMocks();
    mockFormat.mockClear();
  });

  describe('purchasePlanTemplate', () => {
    const mockEmail = 'test@example.com';
    const mockUser = {
      username: 'TestUser',
    };
    const mockSubscription = {
      plan_name: 'Premium Plan',
      expiresAt: '2025-12-31T23:59:59.000Z',
    };
    const formattedDate = 'Wed Dec 31 2025';

    it('should generate a correct email template with valid data', () => {
      // Arrange
      mockFormat.mockReturnValue(formattedDate);

      // Act
      const mailData = purchasePlanTemplate(mockEmail, mockUser, mockSubscription);

      // Assert
      expect(mailData.userEmail).toBe(mockEmail);
      expect(mailData.sub).toBe('Subscription Activated Successfully');
      expect(mailData.message).toContain(`Hello ${mockUser.username},`);
      expect(mailData.message).toContain(
        `your <span style="color: #333333; font-size: 20px; font-weight: bold;">${mockSubscription.plan_name}</span> plan subscription has been successfully activated.`
      );
      expect(mailData.message).toContain(
        `active until <span style="color: #333333; font-size: 20px; font-weight: bold;">${formattedDate}</span>.`
      );

      // Verify that moment was called with the correct arguments
      expect(moment).toHaveBeenCalledWith(mockSubscription.expiresAt);
      expect(mockFormat).toHaveBeenCalledWith('ddd MMM DD YYYY');

      // Use a snapshot to verify the overall HTML structure
      expect(mailData.message).toMatchSnapshot();
    });

    it('should escape HTML special characters in username and plan name to prevent XSS', () => {
      // Arrange
      const maliciousUser = {
        username: '<script>alert("xss")</script>',
      };
      const maliciousSubscription = {
        plan_name: 'Plan with & "quotes" \' and <tags>',
        expiresAt: '2025-12-31T23:59:59.000Z',
      };
      const expectedEscapedUsername = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      const expectedEscapedPlanName = 'Plan with &amp; &quot;quotes&quot; &#039; and &lt;tags&gt;';
      mockFormat.mockReturnValue(formattedDate);

      // Act
      const mailData = purchasePlanTemplate(mockEmail, maliciousUser, maliciousSubscription);

      // Assert
      expect(mailData.message).toContain(`Hello ${expectedEscapedUsername},`);
      expect(mailData.message).toContain(
        `<span style="color: #333333; font-size: 20px; font-weight: bold;">${expectedEscapedPlanName}</span>`
      );
      // Ensure the original, unsafe strings are not present
      expect(mailData.message).not.toContain(maliciousUser.username);
      expect(mailData.message).not.toContain(maliciousSubscription.plan_name);
    });

    it('should use "User" as a fallback if username is null', () => {
      // Arrange
      const userWithoutUsername = { username: null };
      mockFormat.mockReturnValue(formattedDate);

      // Act
      const mailData = purchasePlanTemplate(mockEmail, userWithoutUsername, mockSubscription);

      // Assert
      expect(mailData.message).toContain('Hello User,');
    });

    it('should use "User" as a fallback if username is an empty string', () => {
      // Arrange
      const userWithEmptyUsername = { username: '' };
      mockFormat.mockReturnValue(formattedDate);

      // Act
      const mailData = purchasePlanTemplate(mockEmail, userWithEmptyUsername, mockSubscription);

      // Assert
      expect(mailData.message).toContain('Hello User,');
    });

    it('should handle non-string values for username and plan_name gracefully', () => {
      // Arrange
      const userWithNumberUsername = { username: 12345 };
      const subscriptionWithNumberPlan = {
        plan_name: 999,
        expiresAt: '2025-12-31T23:59:59.000Z',
      };
      mockFormat.mockReturnValue(formattedDate);

      // Act
      const mailData = purchasePlanTemplate(mockEmail, userWithNumberUsername, subscriptionWithNumberPlan);

      // Assert
      // The internal escapeHtml helper should return non-strings as is.
      expect(mailData.message).toContain('Hello 12345,');
      expect(mailData.message).toContain(
        `<span style="color: #333333; font-size: 20px; font-weight: bold;">999</span>`
      );
    });

    it('should handle undefined values for username and plan_name', () => {
      // Arrange
      const userWithUndefinedUsername = { username: undefined };
      const subscriptionWithUndefinedPlan = {
        plan_name: undefined,
        expiresAt: '2025-12-31T23:59:59.000Z',
      };
      mockFormat.mockReturnValue(formattedDate);

      // Act
      const mailData = purchasePlanTemplate(mockEmail, userWithUndefinedUsername, subscriptionWithUndefinedPlan);

      // Assert
      expect(mailData.message).toContain('Hello User,'); // Fallback for undefined username
      // JavaScript template literals convert undefined to the string "undefined"
      expect(mailData.message).toContain(
        `<span style="color: #333333; font-size: 20px; font-weight: bold;">undefined</span>`
      );
    });
  });
});