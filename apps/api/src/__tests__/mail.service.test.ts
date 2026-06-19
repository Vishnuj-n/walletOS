const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockResendSend = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockImplementation(() => ({
    sendMail: mockSendMail,
    verify: mockVerify,
  })),
}));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend,
    },
  })),
}));

import { sendInviteEmail, verifyGlobalSmtpHealth, _resetResendClient } from '../services/mail.service';

describe('MailService tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetResendClient();
    
    // Save original env
    process.env.GLOBAL_SMTP = 'true';
    process.env.GLOBAL_SMTP_USER = 'test@test.com';
    process.env.GLOBAL_SMTP_PASS = 'pass';
    process.env.RESEND_API_KEY = 're_testkey';

    // Set default mock implementations
    mockSendMail.mockResolvedValue({ messageId: '123' });
    mockVerify.mockResolvedValue(true);
    mockResendSend.mockResolvedValue({ data: { id: 'resend-123' }, error: null });
  });

  afterEach(() => {
    delete process.env.GLOBAL_SMTP;
    delete process.env.GLOBAL_SMTP_USER;
    delete process.env.GLOBAL_SMTP_PASS;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('should send email via SMTP when GLOBAL_SMTP is true', async () => {
    process.env.GLOBAL_SMTP = 'true';
    await sendInviteEmail('tenant1', 'recipient@test.com', 'raw-token-123');

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockResendSend).not.toHaveBeenCalled();
    const mailArgs = mockSendMail.mock.calls[0][0];
    expect(mailArgs.to).toBe('recipient@test.com');
    expect(mailArgs.from).toBe('test@test.com');
    expect(mailArgs.html).toContain('tenant1');
    expect(mailArgs.html).toContain('raw-token-123');
  });

  it('should send email via Resend when GLOBAL_SMTP is false', async () => {
    process.env.GLOBAL_SMTP = 'false';
    process.env.RESEND_API_KEY = 're_testkey';
    process.env.RESEND_FROM_EMAIL = 'onboarding@resend.dev';

    await sendInviteEmail('tenant1', 'recipient@test.com', 'raw-token-123');

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockSendMail).not.toHaveBeenCalled();
    const resendArgs = mockResendSend.mock.calls[0][0];
    expect(resendArgs.to).toBe('recipient@test.com');
    expect(resendArgs.from).toBe('onboarding@resend.dev');
    expect(resendArgs.html).toContain('tenant1');
    expect(resendArgs.html).toContain('raw-token-123');
  });

  it('should throw error if Resend sending fails', async () => {
    process.env.GLOBAL_SMTP = 'false';
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: 'Api Error', name: 'api_error' },
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    await expect(
      sendInviteEmail('tenant1', 'recipient@test.com', 'raw-token-123')
    ).rejects.toThrow('Resend API error: Api Error');
    consoleSpy.mockRestore();
  });

  it('should verify SMTP health when GLOBAL_SMTP is true', async () => {
    process.env.GLOBAL_SMTP = 'true';
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await verifyGlobalSmtpHealth();
    expect(mockVerify).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('should not verify SMTP health when GLOBAL_SMTP is false', async () => {
    process.env.GLOBAL_SMTP = 'false';
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await verifyGlobalSmtpHealth();
    expect(mockVerify).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
