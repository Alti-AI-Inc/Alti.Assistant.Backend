import otpGenerator from 'otp-generator';
import config from '../../../../config/index.js';

/**
 * Generates a 6-digit numeric One-Time Password (OTP).
 * The OTP consists only of digits, with no lowercase, uppercase alphabets, or special characters.
 *
 * @async
 * @returns {Promise<string>} A promise that resolves to the generated 6-digit OTP.
 */
export const generateOTP = async () => {
  // otpGenerator.generate is a synchronous function, but awaiting it doesn't cause harm
  // and might be kept for future-proofing if the library ever changes to return a Promise.
  const otp = await otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
  return otp;
};

/**
 * Creates an HTML email template for user registration verification.
 * This template includes a verification code (OTP) and a direct verification link.
 *
 * @param {string} email - The email address of the user to whom the email will be sent.
 * @param {string} token - The 6-digit verification token (OTP) to be included in the email.
 * @returns {object} An object containing the email data:
 *   - `userEmail`: The recipient's email address.
 *   - `sub`: The subject of the email.
 *   - `message`: The HTML content of the email.
 */
export const registrationOtpTemplate = (email, token) => { // Removed 'async' as no await operations are performed
  const frontendUrl = config.client_url || 'https://altiassistant.com';
  const verificationLink = `${frontendUrl}/register?code=${token}`;

  const mailData = {
    userEmail: email,
    sub: 'Verify Your Account',
    message: `<div style=" font-family: 'Arial', sans-serif; padding: 20px; background-color: #f4f4f4;  margin: auto; width: 60%;">
                <div style="max-width: 1050px;  background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
                  <h2 style="color: #333333; text-align: center;">Email Verification</h2>
                  <p style="color: #666666; font-size: 18px;">Dear user,</p>
                  <p style="color: #666666; font-size: 18px;">Thank you for signing up on Alti AI! To complete your registration, please enter the following 6-digit verification code on the registration page:</p>
                  <div style="font-size: 32px; font-weight: bold; color: #242C36; text-align: center; letter-spacing: 5px; margin: 20px 0; background-color: #F5F5F7; padding: 15px; border-radius: 8px; border: 1px solid #E5E5E7;">
                    ${token}
                  </div>
                  <p style="color: #666666; font-size: 18px;">Or click the button below to verify your email automatically:</p>
                  <div style="text-align: center; margin: 20px 0;">
                    <a href="${verificationLink}" 
                       style="display: inline-block; background-color: #242C36; color: #FFFFFF; border: none; border-radius: 8px; padding: 12px 24px; text-decoration: none; font-size: 18px; font-weight: bold;">
                      Verify Account
                    </a>
                  </div>
                  <p style="color: #666666; font-size: 18px;">If you didn't sign up for our service, you can ignore this email.</p>
                </div>
                <p style="color: #999999; margin-top: 20px;">This email was sent by Alti AI.</p>
              </div>`,
  };
  return mailData;
};

/**
 * Creates an HTML email template for forgotten password OTP verification.
 * This template provides the user with a One-Time Password to reset their password.
 *
 * @param {string} email - The email address of the user to whom the email will be sent.
 * @param {object} user - The user object, expected to contain at least a `username` property.
 * @param {string} OTP - The One-Time Password to be included in the email for password reset.
 * @returns {object} An object containing the email data:
 *   - `userEmail`: The recipient's email address.
 *   - `sub`: The subject of the email.
 *   - `message`: The HTML content of the email.
 */
export const forgetPassOtpTemplate = (email, user, OTP) => { // Removed 'async' as no await operations are performed
  const mailData = {
    userEmail: email,
    sub: 'Verify Your One-Time Password (OTP)', // Clear and informative subject
    message: `
      <div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 50%;">
        <div style="max-width: 100%; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
          <h2 style="color: #333333; text-align: center;">Verify Your OTP</h2>
          <p style="color: #666666; font-size: 18px;">
            Dear ${user.username || 'User'},
          </p>
          <p style="color: #666666; font-size: 18px;">
            To complete your reset password, please enter the following OTP: <span style="color: #333333; font-size: 20px; font-weight: bold; text-align: center;">
            ${OTP}
            </span>
          </p>
          <p style="color: #666666; font-size: 18px;">
            This code is valid for 10 minutes. Please do not share it with anyone for your security.
          </p>
        </div>
        <p style="color: #999999; margin-top: 20px; text-align: center;">
          This email was sent by Alti AI.
        </p>
      </div>
    `,
  };
  return mailData;
};

/**
 * Creates an HTML email template for account deletion OTP verification.
 * This template provides the user with a One-Time Password to confirm their account deletion request.
 *
 * @param {object} user - The user object, expected to contain `email` and `username` properties.
 * @param {string} OTP - The One-Time Password to be included in the email for account deletion confirmation.
 * @returns {object} An object containing the email data:
 *   - `userEmail`: The recipient's email address.
 *   - `sub`: The subject of the email.
 *   - `message`: The HTML content of the email.
 */
export const deleteUserOtpTemplate = (user, OTP) => { // Removed 'async' as no await operations are performed
  const mailData = {
    userEmail: user?.email,
    sub: 'Delete Account OTP',
    message: `
      <div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 50%;">
        <div style="max-width: 100%; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
          <h2 style="color: #333333; text-align: center;">Verify Your OTP</h2>
          <p style="color: #666666; font-size: 18px;">
            Dear ${user?.username || 'User'},
          </p>
          <p style="color: #666666; font-size: 18px;">
            To proceed with deleting your account, please enter the following OTP:
            <span style="color: #333333; font-size: 20px; font-weight: bold; text-align: center;">${OTP}</span>
          </p>
          <p style="color: #666666; font-size: 18px;">
            This code is valid for 10 minutes. Please do not share it with anyone for your security.
          </p>
        </div>
        <p style="color: #999999; margin-top: 20px; text-align: center;">
          This email was sent by Alti AI.
        </p>
      </div>
    `,
  };
  return mailData;
};