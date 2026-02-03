import moment from 'moment';


export const purchasePlanTemplate = async (email, user, subscription) => {
    const mailData = {
      userEmail: email,
      sub: 'Subscription Activated Successfully',
      message: `
        <div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: auto; width: 50%;">
          <div style="max-width: 100%; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto; width: 90%;">
            <h2 style="color: #333333; text-align: center;">Subscription Confirmation</h2>
            <p style="color: #666666; font-size: 18px;">
              Hello ${user.username || 'User'},
            </p>
            <p style="color: #666666; font-size: 18px;">
              We are pleased to inform you that your <span style="color: #333333; font-size: 20px; font-weight: bold;">${subscription.plan_name}</span> plan subscription has been successfully activated.
            </p>
            <p style="color: #666666; font-size: 18px;">
              Your subscription will remain active until <span style="color: #333333; font-size: 20px; font-weight: bold;">${moment(subscription.expiresAt).format('ddd MMM DD YYYY')}</span>.
            </p>
            <p style="color: #666666; font-size: 18px;">
              Confidential: Please note that for your security, Do not share.
            </p>
          </div>
          <p style="color: #999999; margin-top: 20px; text-align: center;">
            This message was sent by ASON AI. If you have any questions, feel free to contact our support team.
          </p>
        </div>
      `,
    };
    return mailData;
};