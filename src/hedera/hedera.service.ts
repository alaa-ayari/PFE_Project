// Hedera Consensus Service client: topic creation, message submission with retry, mirror-node read.

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import axios from 'axios';
import { retryAsync } from '../resilience/retry.util';
import { DeadLetterService } from '../resilience/dead-letter.service';

export interface HcsMessageResult {
  transactionId: string;
  sequenceNumber: number | null;
}

export interface SignatureRecord {
  contractId: string;
  role: 'owner' | 'tenant' | 'lawyer';
  signerUserId: string;
  signatureBase64: string;
  contractHash: string;
  timestamp: string;
}

@Injectable()
export class HederaService implements OnModuleDestroy {
  private readonly logger = new Logger(HederaService.name);
  private client: Client | null = null;

  constructor(private readonly deadLetter: DeadLetterService) {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;

    if (!accountId || !privateKey) {
      this.logger.warn(
        'HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY not set — Hedera disabled',
      );
      return;
    }

    this.client = Client.forTestnet();
    this.client.setOperator(accountId, privateKey);
    this.logger.log(`Hedera client ready (operator: ${accountId})`);
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  async createTopic(memo: string): Promise<string> {
    if (!this.client) throw new Error('Hedera not configured');
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .execute(this.client);
    const receipt = await tx.getReceipt(this.client);
    const topicId = receipt.topicId!.toString();
    this.logger.log(`Topic created: ${topicId} (${memo})`);
    return topicId;
  }

  async submitMessage(topicId: string, payload: any): Promise<HcsMessageResult> {
    if (!this.client) throw new Error('Hedera not configured');
    const client = this.client;
    let attempts = 0;
    try {
      return await retryAsync(
        async () => {
          const tx = await new TopicMessageSubmitTransaction()
            .setTopicId(topicId)
            .setMessage(JSON.stringify(payload))
            .execute(client);
          const receipt = await tx.getReceipt(client);
          const transactionId = tx.transactionId!.toString();
          const sequenceNumber = receipt.topicSequenceNumber
            ? Number(receipt.topicSequenceNumber)
            : null;
          this.logger.log(
            `HCS submit: topic=${topicId} txId=${transactionId} seq=${sequenceNumber}`,
          );
          return { transactionId, sequenceNumber };
        },
        { retries: 3, onAttemptFail: (a) => (attempts = a) },
      );
    } catch (err) {

      await this.deadLetter.record(
        'hedera',
        { topicId, payload },
        err,
        attempts,
      );
      throw err;
    }
  }

  async getMessages(topicId: string): Promise<any[]> {
    try {
      const url = `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`;
      const { data } = await axios.get<{ messages?: { message: string; sequence_number?: number; consensus_timestamp?: string }[] }>(url);
      const messages: any[] = [];
      for (const msg of data?.messages ?? []) {
        try {
          const decoded = Buffer.from(msg.message, 'base64').toString('utf8');
          messages.push({
            ...JSON.parse(decoded),
            _sequenceNumber: msg.sequence_number,
            _consensusTimestamp: msg.consensus_timestamp,
          });
        } catch {

        }
      }
      return messages;
    } catch (e) {
      this.logger.error(`Mirror node fetch failed for ${topicId}: ${e}`);
      return [];
    }
  }

  verifyUrl(topicId: string): string {
    return `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`;
  }

  async createSigningSession(contractId: string): Promise<string> {
    return this.createTopic(`Aqari Contract Signing - ${contractId}`);
  }

  async recordSignature(topicId: string, record: SignatureRecord): Promise<string> {
    const { transactionId } = await this.submitMessage(topicId, {
      type: 'signature',
      ...record,
    });
    return transactionId;
  }

  async getSigningMessages(topicId: string): Promise<SignatureRecord[]> {
    const all = await this.getMessages(topicId);
    return all.filter((m) => m.type === 'signature' || m.contractId) as SignatureRecord[];
  }

  onModuleDestroy() {
    this.client?.close();
  }
}
