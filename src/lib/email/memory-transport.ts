import crypto from 'node:crypto';
import type {
  EmailTransport,
  EmailMessage,
  EmailSendResult,
} from './types.ts';

export interface RecordedEmailMessage extends EmailMessage {
  id: string;
  sentAt: Date;
}

export class MemoryEmailTransport implements EmailTransport {
  readonly provider = 'memory' as const;
  private readonly sentMessages: RecordedEmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const id = `mem_${crypto.randomUUID()}`;
    this.sentMessages.push({
      ...message,
      id,
      sentAt: new Date(),
    });

    return {
      provider: this.provider,
      messageId: id,
    };
  }

  getSentMessages(): RecordedEmailMessage[] {
    return [...this.sentMessages];
  }

  getLastMessage(): RecordedEmailMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  clear(): void {
    this.sentMessages.length = 0;
  }
}
