import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockSendMailWithNodeMailer,
  mockGenerateInvitationEmailHTML,
  mockGenerateInvitationEmailText,
  mockGetInvitationEmailSubject,
  mockLogger,
  mockConfig
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockSendMailWithNodeMailer = vi.fn();

  const mockGenerateInvitationEmailHTML = vi.fn();
  const mockGenerateInvitationEmailText = vi.fn();
  const mockGetInvitationEmailSubject = vi.fn();

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockConfig = {
    app: {
      frontend_url: 'http://localhost:3000',
    },
  };

  return {
    mockSendMailWithNodeMailer,
    mockGenerateInvitationEmailHTML,
    mockGenerateInvitationEmailText,
    mockGetInvitationEmailSubject,
    mockLogger,
    mockConfig
  };
});

vi.mock('../../middlewares/sendEmail/sendMail.js', () => ({
  sendMailWithNodeMailer: mockSendMailWithNodeMailer,
}));

vi.mock('./templates/invitationEmail.js', () => ({
  generateInvitationEmailHTML: mockGenerateInvitationEmailHTML,
  generateInvitationEmailText: mockGenerateInvitationEmailText,
  getInvitationEmailSubject: mockGetInvitationEmailSubject,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

// Mock setInterval and clearInterval to prevent background timers from running during tests.
// The module's internal setInterval for cache cleanup will be "created" but not executed.
// The cache cleanup logic is implicitly tested by `checkEmailRateLimit`'s filtering.
vi.stubGlobal('setInterval', vi.fn().mockImplementation(() => 12345)); // Return a dummy ID
vi.stubGlobal('clearInterval', vi.fn());

describe('tenantInvitation.email', () => {
  // Use fake timers to control Date.now() for rate limiting tests
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks(); // Clear all mock calls

    // Reset modules to clear internal state like emailRateLimitCache for each test.
    // This ensures tests are isolated from each other's cache modifications.
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore all mocks, including global ones like setInterval
    vi.useRealTimers(); // Restore real timers
  });

  // Dynamically import the module under test in beforeEach to get a fresh instance
  // with its internal state (like emailRateLimitCache) reset for each test.
  let tenantInvitationEmail;
  beforeEach(async () => {
    tenantInvitationEmail = await import('./tenantInvitation.email.js');
  });

  describe('isValidEmail', () => {
    it('should return true for valid email addresses', () => {
      expect(tenantInvitationEmail.isValidEmail('test@example.com')).toBe(true);
      expect(tenantInvitationEmail.isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(tenantInvitationEmail.isValidEmail('a@b.c')).toBe(true);
    });

    it('should return false for invalid email addresses', () => {
      expect(tenantInvitationEmail.isValidEmail('invalid-email')).toBe(false);
      expect(tenantInvitationEmail.isValidEmail('user@.com')).toBe(false);
      expect(tenantInvitationEmail.isValidEmail('@domain.com')).toBe(false);
      expect(tenantInvitationEmail.isValidEmail('user@domain')).toBe(false);
      expect(tenantInvitationEmail.isValidEmail('')).toBe(false);
      expect(tenantInvitationEmail.isValidEmail(null)).toBe(false);
      expect(tenantInvitationEmail.isValidEmail(undefined)).toBe(false);
    });
  });

  describe('checkEmailRateLimit', () => {
    const testEmail = 'test@example.com';
    const MAX_EMAILS_PER_HOUR = 5; // From the original file
    const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour from the original file

    it('should allow the first email to be sent', () => {
      expect(tenantInvitationEmail.checkEmailRateLimit(testEmail)).toBe(true);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it(`should allow up to ${MAX_EMAILS_PER_HOUR} emails within the rate limit window`, () => {
      for (let i = 0; i < MAX_EMAILS_PER_HOUR; i++) {
        vi.setSystemTime(Date.now() + i * 1000); // Advance time slightly for each email
        expect(tenantInvitationEmail.checkEmailRateLimit(testEmail)).toBe(true);
      }
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it(`should block emails after ${MAX_EMAILS_PER_HOUR} emails within the rate limit window`, () => {
      for (let i = 0; i < MAX_EMAILS_PER_HOUR; i++) {
        vi.setSystemTime(Date.now() + i * 1000);
        tenantInvitationEmail.checkEmailRateLimit(testEmail);
      }
      vi.setSystemTime(Date.now() + MAX_EMAILS_PER_HOUR * 1000); // Advance time
      expect(tenantInvitationEmail.checkEmailRateLimit(testEmail)).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(`Rate limit exceeded for email: ${testEmail}`);
    });

    it('should allow emails again after the rate limit window has passed', () => {
      for (let i = 0; i < MAX_EMAILS_PER_HOUR; i++) {
        vi.setSystemTime(Date.now() + i * 1000);
        tenantInvitationEmail.checkEmailRateLimit(testEmail);
      }
      expect(tenantInvitationEmail.checkEmailRateLimit(testEmail)).toBe(false); // Blocked initially

      vi.advanceTimersByTime(RATE_LIMIT_WINDOW + 1); // Advance time past the window

      expect(tenantInvitationEmail.checkEmailRateLimit(testEmail)).toBe(true); // Should be allowed again
      expect(mockLogger.warn).toHaveBeenCalledTimes(1); // Only warned once for the initial block
    });

    it('should handle case-insensitivity for email addresses', () => {
      const email1 = 'Test@Example.com';
      const email2 = 'test@example.com';

      expect(tenantInvitationEmail.checkEmailRateLimit(email1)).toBe(true);
      expect(tenantInvitationEmail.checkEmailRateLimit(email2)).toBe(true); // Should count towards the same limit
      expect(tenantInvitationEmail.checkEmailRateLimit(email1)).toBe(true);
      expect(tenantInvitationEmail.checkEmailRateLimit(email2)).toBe(true);
      expect(tenantInvitationEmail.checkEmailRateLimit(email1)).toBe(true); // 5th email

      expect(tenantInvitationEmail.checkEmailRateLimit(email2)).toBe(false); // 6th email, should be blocked
      expect(mockLogger.warn).toHaveBeenCalledWith(`Rate limit exceeded for email: ${email2}`);
    });

    it('should correctly filter old timestamps when new emails are sent', () => {
      const email = 'filter@example.com';
      const now = Date.now();

      // Send 3 emails
      vi.setSystemTime(now);
      tenantInvitationEmail.checkEmailRateLimit(email);
      vi.setSystemTime(now + 1000);
      tenantInvitationEmail.checkEmailRateLimit(email);
      vi.setSystemTime(now + 2000);
      tenantInvitationEmail.checkEmailRateLimit(email);

      // Advance time so the first email is outside the window, but others are still in
      vi.setSystemTime(now + RATE_LIMIT_WINDOW + 100); // First email is now old

      // Send 3 more emails. The first old email should be filtered out, allowing more.
      expect(tenantInvitationEmail.checkEmailRateLimit(email)).toBe(true); // 4th recent email
      expect(tenantInvitationEmail.checkEmailRateLimit(email)).toBe(true); // 5th recent email
      expect(tenantInvitationEmail.checkEmailRateLimit(email)).toBe(false); // 6th recent email, should be blocked
      expect(mockLogger.warn).toHaveBeenCalledWith(`Rate limit exceeded for email: ${email}`);
    });
  });

  describe('sendInvitationEmail', () => {
    const invitationData = {
      email: 'recipient@example.com',
      inviterName: 'John Doe',
      tenantName: 'Acme Corp',
      token: 'some-secure-token',
      role: 'admin',
      expiryDays: 10,
    };

    const expectedInvitationLink = `${mockConfig.app.frontend_url}/accept-invite/${invitationData.token}`;
    const expectedHtmlContent = '<html>Invitation HTML</html>';
    const expectedTextContent = 'Invitation Text';
    const expectedSubject = `You're invited to ${invitationData.tenantName} by ${invitationData.inviterName}`;

    beforeEach(() => {
      mockGenerateInvitationEmailHTML.mockReturnValue(expectedHtmlContent);
      mockGenerateInvitationEmailText.mockReturnValue(expectedTextContent);
      mockGetInvitationEmailSubject.mockReturnValue(expectedSubject);
      mockSendMailWithNodeMailer.mockResolvedValue({ messageId: 'mock-message-id' });
    });

    it('should send an invitation email successfully on the first attempt', async () => {
      const result = await tenantInvitationEmail.sendInvitationEmail(invitationData);

      expect(result).toEqual({
        success: true,
        messageId: 'mock-message-id',
        email: invitationData.email,
        attempt: 1,
      });

      expect(mockGenerateInvitationEmailHTML).toHaveBeenCalledWith({
        inviterName: invitationData.inviterName,
        tenantName: invitationData.tenantName,
        invitationLink: expectedInvitationLink,
        role: invitationData.role,
        expiryDays: invitationData.expiryDays,
      });
      expect(mockGenerateInvitationEmailText).toHaveBeenCalledWith({
        inviterName: invitationData.inviterName,
        tenantName: invitationData.tenantName,
        invitationLink: expectedInvitationLink,
        role: invitationData.role,
        expiryDays: invitationData.expiryDays,
      });
      expect(mockGetInvitationEmailSubject).toHaveBeenCalledWith(
        invitationData.tenantName,
        invitationData.inviterName
      );
      expect(mockSendMailWithNodeMailer).toHaveBeenCalledWith({
        sub: expectedSubject,
        message: expectedHtmlContent,
        userEmail: invitationData.email,
        text: expectedTextContent,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Sending invitation email to ${invitationData.email} (attempt 1/3)`
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Invitation email sent successfully to ${invitationData.email}`,
        expect.any(Object)
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should use default role and expiryDays if not provided', async () => {
      const dataWithoutDefaults = {
        email: 'default@example.com',
        inviterName: 'Jane Doe',
        tenantName: 'Default Co',
        token: 'default-token',
      };
      await tenantInvitationEmail.sendInvitationEmail(dataWithoutDefaults);

      expect(mockGenerateInvitationEmailHTML).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          expiryDays: 7,
        })
      );
    });

    it('should retry sending email on failure and succeed on a subsequent attempt', async () => {
      mockSendMailWithNodeMailer
        .mockRejectedValueOnce(new Error('SMTP error 1'))
        .mockRejectedValueOnce(new Error('SMTP error 2'))
        .mockResolvedValueOnce({ messageId: 'mock-message-id-retry' });

      const result = await tenantInvitationEmail.sendInvitationEmail(invitationData);

      expect(result).toEqual({
        success: true,
        messageId: 'mock-message-id-retry',
        email: invitationData.email,
        attempt: 3,
      });
      expect(mockSendMailWithNodeMailer).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Sending invitation email to ${invitationData.email} (attempt 1/3)`
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to send invitation email (attempt 1/3)`,
        expect.objectContaining({ error: 'SMTP error 1' })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Sending invitation email to ${invitationData.email} (attempt 2/3)`
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to send invitation email (attempt 2/3)`,
        expect.objectContaining({ error: 'SMTP error 2' })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Sending invitation email to ${invitationData.email} (attempt 3/3)`
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Invitation email sent successfully to ${invitationData.email}`,
        expect.any(Object)
      );
      expect(mockLogger.error).toHaveBeenCalledTimes(2); // Only two errors before success
    });

    it('should throw an error if all retries fail', async () => {
      const errorMessage = 'SMTP connection failed';
      mockSendMailWithNodeMailer.mockRejectedValue(new Error(errorMessage));

      await expect(tenantInvitationEmail.sendInvitationEmail(invitationData)).rejects.toThrow(
        `Failed to send invitation email after 3 attempts: ${errorMessage}`
      );

      expect(mockSendMailWithNodeMailer).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledTimes(3); // Error logged for each attempt
      expect(mockLogger.error).toHaveBeenCalledWith(
        `All attempts to send invitation email failed`,
        expect.objectContaining({ error: errorMessage })
      );
    });

    it('should throw an error if rate limit is exceeded', async () => {
      // Exceed rate limit
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(Date.now() + i * 1000);
        await tenantInvitationEmail.sendInvitationEmail({ ...invitationData, email: 'ratelimit@example.com' });
      }
      vi.setSystemTime(Date.now() + 5 * 1000); // Advance time

      await expect(tenantInvitationEmail.sendInvitationEmail({ ...invitationData, email: 'ratelimit@example.com' })).rejects.toThrow(
        'Rate limit exceeded. Please try again later.'
      );
      expect(mockSendMailWithNodeMailer).toHaveBeenCalledTimes(5); // Only 5 emails sent
      expect(mockLogger.warn).toHaveBeenCalledWith(`Rate limit exceeded for email: ratelimit@example.com`);
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to send invitation email')
      ); // No email sending failure, just rate limit
    });

    it('should use fallback frontend_url if config.app.frontend_url is not defined', async () => {
      mockConfig.app.frontend_url = undefined; // Simulate missing config
      // Re-import the module to pick up the changed config mock
      vi.resetModules();
      tenantInvitationEmail = await import('./tenantInvitation.email.js');

      await tenantInvitationEmail.sendInvitationEmail(invitationData);

      const expectedFallbackLink = `https://app.insohq.com/accept-invite/${invitationData.token}`;
      expect(mockGenerateInvitationEmailHTML).toHaveBeenCalledWith(
        expect.objectContaining({
          invitationLink: expectedFallbackLink,
        })
      );
      // Restore config for other tests
      mockConfig.app.frontend_url = 'http://localhost:3000';
    });
  });

  describe('sendInvitationReminderEmail', () => {
    const invitationData = {
      email: 'reminder@example.com',
      inviterName: 'Jane Doe',
      tenantName: 'Reminder Co',
      token: 'reminder-token',
      role: 'member',
      expiryDays: 3,
    };

    const expectedInvitationLink = `${mockConfig.app.frontend_url}/invite/${invitationData.token}`; // Note: different path for reminder
    const expectedHtmlContent = '<html>Reminder HTML</html>';
    const expectedSubject = `Reminder: Your invitation to ${invitationData.tenantName} expires soon`;

    beforeEach(() => {
      mockGenerateInvitationEmailHTML.mockReturnValue(expectedHtmlContent);
      mockSendMailWithNodeMailer.mockResolvedValue({ messageId: 'mock-reminder-message-id' });
    });

    it('should send a reminder email successfully', async () => {
      const result = await tenantInvitationEmail.sendInvitationReminderEmail(invitationData);

      expect(result).toEqual({
        success: true,
        messageId: 'mock-reminder-message-id',
      });

      expect(mockGenerateInvitationEmailHTML).toHaveBeenCalledWith({
        inviterName: invitationData.inviterName,
        tenantName: invitationData.tenantName,
        invitationLink: expectedInvitationLink,
        role: invitationData.role,
        expiryDays: invitationData.expiryDays,
      });
      expect(mockSendMailWithNodeMailer).toHaveBeenCalledWith({
        sub: expectedSubject,
        message: expectedHtmlContent,
        userEmail: invitationData.email,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(`Reminder email sent to ${invitationData.email}`);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should throw an error if sending the reminder email fails', async () => {
      const errorMessage = 'Reminder email failed';
      mockSendMailWithNodeMailer.mockRejectedValue(new Error(errorMessage));

      await expect(tenantInvitationEmail.sendInvitationReminderEmail(invitationData)).rejects.toThrow(
        errorMessage
      );

      expect(mockSendMailWithNodeMailer).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to send reminder email to ${invitationData.email}:`,
        expect.any(Error)
      );
    });

    it('should use fallback frontend_url for reminder if config.app.frontend_url is not defined', async () => {
      mockConfig.app.frontend_url = undefined; // Simulate missing config
      // Re-import the module to pick up the changed config mock
      vi.resetModules();
      tenantInvitationEmail = await import('./tenantInvitation.email.js');

      await tenantInvitationEmail.sendInvitationReminderEmail(invitationData);

      const expectedFallbackLink = `https://app.insohq.com/invite/${invitationData.token}`;
      expect(mockGenerateInvitationEmailHTML).toHaveBeenCalledWith(
        expect.objectContaining({
          invitationLink: expectedFallbackLink,
        })
      );
      // Restore config for other tests
      mockConfig.app.frontend_url = 'http://localhost:3000';
    });
  });

  // Test the default export
  describe('default export', () => {
    it('should export the correct functions', async () => {
      const defaultExport = tenantInvitationEmail.default;
      expect(defaultExport).toBeDefined();
      expect(defaultExport.sendInvitationEmail).toBe(tenantInvitationEmail.sendInvitationEmail);
      expect(defaultExport.sendInvitationReminderEmail).toBe(tenantInvitationEmail.sendInvitationReminderEmail);
      expect(defaultExport.isValidEmail).toBe(tenantInvitationEmail.isValidEmail);
      expect(defaultExport.checkEmailRateLimit).toBe(tenantInvitationEmail.checkEmailRateLimit);
    });
  });
});