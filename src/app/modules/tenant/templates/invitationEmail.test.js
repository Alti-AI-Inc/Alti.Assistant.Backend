import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateInvitationEmailHTML,
  generateInvitationEmailText,
  getInvitationEmailSubject,
} from './invitationEmail';

describe('Invitation Email Templates', () => {
  const mockData = {
    inviterName: 'John Doe',
    tenantName: 'Acme Corp',
    invitationLink: 'https://app.altihq.com/invite/12345',
    role: 'member',
    expiryDays: 10,
  };

  const mockAdminData = {
    ...mockData,
    role: 'admin',
  };

  // Mock Date.getFullYear() for consistent year in templates
  const MOCK_YEAR = 2023;
  const realDate = Date;

  beforeEach(() => {
    const mockDate = class extends realDate {
      constructor() {
        super();
      }
      getFullYear() {
        return MOCK_YEAR;
      }
    };
    vi.stubGlobal('Date', mockDate);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('generateInvitationEmailHTML', () => {
    it('should generate HTML email with all provided data for member role', () => {
      const html = generateInvitationEmailHTML(mockData);

      expect(html).toContain(`You're Invited to ${mockData.tenantName}`);
      expect(html).toContain(`<strong>${mockData.inviterName}</strong> has invited you to join <strong>${mockData.tenantName}</strong> workspace as a <strong>${mockData.role}</strong>.`);
      expect(html).toContain(`href="${mockData.invitationLink}"`);
      expect(html).toContain(`Accept Invitation</a>`);
      expect(html).toContain(`This invitation will expire in ${mockData.expiryDays} days.`);
      expect(html).toContain(`Member access to team features`);
      expect(html).not.toContain(`Full administrative access`);
      expect(html).toContain(`© ${MOCK_YEAR} Alti Assistant. All rights reserved.`);
      expect(html).toMatch(/^<!DOCTYPE html>/); // Check for valid HTML start
      expect(html).toMatch(/<\/html>$/); // Check for valid HTML end
      expect(html).toContain('<style>'); // Ensure styles are included
    });

    it('should generate HTML email with default expiryDays if not provided', () => {
      const dataWithoutExpiry = { ...mockData };
      delete dataWithoutExpiry.expiryDays;
      const html = generateInvitationEmailHTML(dataWithoutExpiry);

      expect(html).toContain(`This invitation will expire in 7 days.`); // Default is 7
    });

    it('should generate HTML email with correct content for admin role', () => {
      const html = generateInvitationEmailHTML(mockAdminData);

      expect(html).toContain(`<strong>${mockAdminData.inviterName}</strong> has invited you to join <strong>${mockAdminData.tenantName}</strong> workspace as a <strong>${mockAdminData.role}</strong>.`);
      expect(html).toContain(`Full administrative access`);
      expect(html).not.toContain(`Member access to team features`);
    });

    it('should contain basic HTML structure elements', () => {
      const html = generateInvitationEmailHTML(mockData);
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
      expect(html).toContain('<title>');
      expect(html).toContain('<div class="email-container">');
      expect(html).toContain('<div class="header">');
      expect(html).toContain('<div class="content">');
      expect(html).toContain('<div class="footer">');
    });
  });

  describe('generateInvitationEmailText', () => {
    it('should generate plain text email with all provided data for member role', () => {
      const text = generateInvitationEmailText(mockData);

      expect(text).toContain(`You're Invited to ${mockData.tenantName}!`);
      expect(text).toContain(`${mockData.inviterName} has invited you to join ${mockData.tenantName} workspace as a ${mockData.role}.`);
      expect(text).toContain(`Accept Invitation:\n${mockData.invitationLink}`);
      expect(text).toContain(`IMPORTANT: This invitation will expire in ${mockData.expiryDays} days.`);
      expect(text).toContain(`Member access to team features`);
      expect(text).not.toContain(`Full administrative access`);
      expect(text).toContain(`© ${MOCK_YEAR} Alti Assistant. All rights reserved.`);
    });

    it('should generate plain text email with default expiryDays if not provided', () => {
      const dataWithoutExpiry = { ...mockData };
      delete dataWithoutExpiry.expiryDays;
      const text = generateInvitationEmailText(dataWithoutExpiry);

      expect(text).toContain(`IMPORTANT: This invitation will expire in 7 days.`); // Default is 7
    });

    it('should generate plain text email with correct content for admin role', () => {
      const text = generateInvitationEmailText(mockAdminData);

      expect(text).toContain(`${mockAdminData.inviterName} has invited you to join ${mockAdminData.tenantName} workspace as a ${mockAdminData.role}.`);
      expect(text).toContain(`Full administrative access`);
      expect(text).not.toContain(`Member access to team features`);
    });
  });

  describe('getInvitationEmailSubject', () => {
    it('should generate the correct email subject', () => {
      const subject = getInvitationEmailSubject(mockData.tenantName, mockData.inviterName);
      expect(subject).toBe(`You've been invited to join ${mockData.tenantName} by ${mockData.inviterName}`);
    });

    it('should handle different tenant and inviter names', () => {
      const subject = getInvitationEmailSubject('Another Company', 'Jane Smith');
      expect(subject).toBe(`You've been invited to join Another Company by Jane Smith`);
    });

    it('should return a subject even with empty names', () => {
      const subject = getInvitationEmailSubject('', '');
      expect(subject).toBe(`You've been invited to join  by `);
    });
  });
});