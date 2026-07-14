// Contract drafting and signing with Hedera-anchored signatures.

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { Contract } from './schema/contract.schema';
import { Application } from '../applications/schema/application.schema';
import { User } from '../users/schema/user.schema';
import { Property } from '../property/schema/property.schema';
import { CreateContractDto } from './dto/create-contract.dto';
import { RentalsService } from '../rentals/rentals.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HederaService } from '../hedera/hedera.service';
import { MessagingGateway } from '../applications/messaging.gateway';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    @InjectModel(Contract.name) private contractModel: Model<Contract>,
    @InjectModel(Application.name) private applicationModel: Model<Application>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Property.name) private propertyModel: Model<Property>,
    private rentalsService: RentalsService,
    private notificationsService: NotificationsService,
    private hederaSigningService: HederaService,
    private messagingGateway: MessagingGateway,
  ) {}

  private async _emitContract(applicationId: string, contractId?: string) {
    try {
      const contract = contractId
        ? await this.contractModel
            .findById(contractId)
            .populate('propertyId')
            .populate('tenantId')
            .populate('ownerId')
            .populate('lawyerId')
            .exec()
        : await this.contractModel
            .findOne({ applicationId })
            .populate('propertyId')
            .populate('tenantId')
            .populate('ownerId')
            .populate('lawyerId')
            .exec();
      if (!contract) return;
      this.messagingGateway.emitContractUpdate(applicationId, contract);

      const ownerId =
        (contract.ownerId as any)?._id?.toString?.() ??
        contract.ownerId?.toString();
      const tenantId =
        (contract.tenantId as any)?._id?.toString?.() ??
        contract.tenantId?.toString();
      const lawyerId =
        (contract.lawyerId as any)?._id?.toString?.() ??
        contract.lawyerId?.toString();
      this.messagingGateway.emitToUsers(
        [ownerId, tenantId, lawyerId].filter(Boolean) as string[],
        'contractUpdated',
        contract,
      );
    } catch (e) {
      this.logger.error(`emitContract failed for app ${applicationId}: ${e}`);
    }
  }

  async create(dto: CreateContractDto, lawyerId: string) {
    const app = await this.applicationModel
      .findById(dto.applicationId)
      .populate('property')
      .exec();
    if (!app) throw new NotFoundException('Application not found');

    const propertyDoc = app.property as any;
    const propertyId = propertyDoc?._id ?? propertyDoc;
    const ownerId = propertyDoc?.owner?._id ?? propertyDoc?.owner;
    const tenantId = (app.applicant as any)?._id ?? app.applicant;

    const contract = await this.contractModel.create({
      ...dto,
      lawyerId,
      propertyId,
      tenantId,
      ownerId,
    });
    await this.applicationModel.findByIdAndUpdate(dto.applicationId, {
      status: 'contract_drafting',
    });

    const [owner, tenant] = await Promise.all([
      this.userModel.findById(ownerId),
      this.userModel.findById(tenantId),
    ]);
    const contractCreatedMsg = 'A rental contract has been drafted for your application. Please review it.';
    const contractId = (contract as any)._id.toString();
    if (owner?.fcmToken)
      await this.notificationsService.sendToToken(
        owner.fcmToken,
        'Contract Created',
        contractCreatedMsg,
        { contractId, type: 'contract_created' },
      );
    if (tenant?.fcmToken)
      await this.notificationsService.sendToToken(
        tenant.fcmToken,
        'Contract Created',
        contractCreatedMsg,
        { contractId, type: 'contract_created' },
      );

    this._emitContract(dto.applicationId, contractId);
    this._emitApplication(dto.applicationId);

    return contract;
  }

  private async _emitApplication(applicationId: string) {
    try {
      const populated = await this.applicationModel
        .findById(applicationId)
        .populate({
          path: 'property',
          select:
            'Propertyaddresse propertyimages owner PropertyType propertyStatus description',
          populate: { path: 'owner', select: 'name lastName email profileImageUrl' },
        })
        .populate({
          path: 'applicant',
          select:
            'name lastName email phoneNumber profileImageUrl identitynumber dateOfBirth placeOfBirth address issueDate issuePlace signatureUrl faceRegistered isVerified',
        })
        .exec();
      if (!populated) return;
      this.messagingGateway.emitApplicationUpdate(applicationId, populated);
      const ownerId =
        (populated.property as any)?.owner?._id?.toString?.() ??
        (populated.property as any)?.owner?.toString();
      const applicantId =
        (populated.applicant as any)?._id?.toString?.() ??
        populated.applicant?.toString();
      this.messagingGateway.emitToUsers(
        [ownerId, applicantId].filter(Boolean) as string[],
        'applicationUpdated',
        populated,
      );
    } catch (e) {
      this.logger.error(`emitApplication failed for ${applicationId}: ${e}`);
    }
  }

  async findByLawyer(lawyerId: string) {
    return this.contractModel
      .find({ lawyerId })
      .populate('propertyId')
      .populate('tenantId')
      .populate('ownerId')
      .populate('applicationId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findMyContracts(userId: string) {
    return this.contractModel
      .find({ $or: [{ ownerId: userId }, { tenantId: userId }] })
      .populate('propertyId')
      .populate('tenantId')
      .populate('ownerId')
      .populate('lawyerId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string) {
    const contract = await this.contractModel
      .findById(id)
      .populate('propertyId')
      .populate('tenantId')
      .populate('ownerId')
      .populate('lawyerId')
      .exec();
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async findByApplication(applicationId: string) {
    const contract = await this.contractModel
      .findOne({ applicationId })
      .populate('propertyId')
      .populate('tenantId')
      .populate('ownerId')
      .populate('lawyerId')
      .exec();
    if (!contract) throw new NotFoundException('Contract not found for this application');
    return contract;
  }

  async update(id: string, lawyerId: string, body: Partial<Contract>) {
    const contract = await this.contractModel.findOne({ _id: id, lawyerId });
    if (!contract) throw new NotFoundException('Contract not found or access denied');

    const update: any = { ...body };
    const contentChanged =
      typeof body.content === 'string' && body.content !== contract.content;
    const openRequests = (contract.revisionRequests as any[])?.filter(
      (r) => !r.resolved,
    );
    if (contentChanged && openRequests?.length) {
      const now = new Date();
      const resolvedList = (contract.revisionRequests as any[]).map((r) =>
        r.resolved ? r : { ...(r.toObject?.() ?? r), resolved: true, resolvedAt: now },
      );
      update.revisionRequests = resolvedList;
      update.version = (contract.version ?? 1) + 1;

      try {
        const app = await this.applicationModel
          .findById(contract.applicationId)
          .select('hcsTopicId')
          .exec();
        const topicId = (app as any)?.hcsTopicId;
        if (topicId && this.hederaSigningService.isEnabled) {
          await this.hederaSigningService.submitMessage(topicId, {
            kind: 'contract_revision',
            contractId: id,
            version: update.version,
            timestamp: now.toISOString(),
          });
        }
      } catch (e) {
        this.logger.error(`Failed to announce revision for ${id}: ${e}`);
      }

      const [owner, tenant] = await Promise.all([
        this.userModel.findById(contract.ownerId),
        this.userModel.findById(contract.tenantId),
      ]);
      const msg = `A revised contract (v${update.version}) is ready for your review.`;
      const data = { contractId: id, type: 'contract_revised' };
      if (owner?.fcmToken)
        this.notificationsService
          .sendToToken(owner.fcmToken, 'Contract Revised', msg, data)
          .catch(() => {});
      if (tenant?.fcmToken)
        this.notificationsService
          .sendToToken(tenant.fcmToken, 'Contract Revised', msg, data)
          .catch(() => {});
    }

    const updated = await this.contractModel.findByIdAndUpdate(id, update, { new: true });
    if (updated) this._emitContract(updated.applicationId.toString(), id);
    return updated;
  }

  async requestRevision(contractId: string, userId: string, reason?: string) {
    const contract = await this.contractModel.findById(contractId);
    if (!contract) throw new NotFoundException('Contract not found');

    const isOwner = contract.ownerId.toString() === userId;
    const isTenant = contract.tenantId.toString() === userId;
    if (!isOwner && !isTenant) {
      throw new ForbiddenException('Only owner or tenant may request a revision');
    }

    const allowed = ['pending_review', 'pending_signatures', 'signed_by_owner', 'signed_by_tenant'];
    if (!allowed.includes(contract.status)) {
      throw new BadRequestException(
        `Cannot request a revision while contract is ${contract.status}`,
      );
    }

    const requestId = randomUUID();

    let txId: string | undefined;
    let seq: number | undefined;
    try {
      const app = await this.applicationModel
        .findById(contract.applicationId)
        .select('hcsTopicId')
        .exec();
      const topicId = (app as any)?.hcsTopicId;
      if (topicId && this.hederaSigningService.isEnabled) {
        const res = await this.hederaSigningService.submitMessage(topicId, {
          kind: 'revision_request',
          contractId,
          requestedBy: userId,
          requestId,
          reason: reason ?? null,
          timestamp: new Date().toISOString(),
        });
        txId = res.transactionId;
        seq = res.sequenceNumber ?? undefined;
      }
    } catch (e) {
      this.logger.error(`HCS submit failed for revision on ${contractId}: ${e}`);
    }

    (contract.revisionRequests as any[]).push({
      requestId,
      requestedBy: userId,
      reason,
      resolved: false,
      hcsTxId: txId,
      hcsSequenceNumber: seq,
      createdAt: new Date(),
    });

    contract.status = 'draft';
    if (contract.ownerSignatureUrl) contract.ownerSignatureUrl = undefined;
    if (contract.tenantSignatureUrl) contract.tenantSignatureUrl = undefined;
    if ((contract as any).ownerSignatureTxId) (contract as any).ownerSignatureTxId = undefined;
    if ((contract as any).tenantSignatureTxId) (contract as any).tenantSignatureTxId = undefined;

    const saved = await contract.save();

    const lawyer = await this.userModel.findById(contract.lawyerId).select('fcmToken').exec();
    if (lawyer?.fcmToken) {
      this.notificationsService
        .sendToToken(
          lawyer.fcmToken,
          'Revision Requested',
          reason
            ? `A party requested a revision: ${reason}`
            : 'A party requested a revision to the contract.',
          { contractId, type: 'revision_requested' },
        )
        .catch(() => {});
    }

    this._emitContract(contract.applicationId.toString(), contractId);

    return saved.toObject();
  }

  async updateStatus(id: string, lawyerId: string, status: string) {

    const existing = await this.contractModel.findOne({ _id: id, lawyerId });
    if (!existing) {
      throw new NotFoundException('Contract not found or access denied');
    }
    const contract = await this.contractModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
    if (!contract) throw new NotFoundException('Contract not found');

    if (status === 'pending_signatures') {
      const [owner, tenant] = await Promise.all([
        this.userModel.findById(contract.ownerId),
        this.userModel.findById(contract.tenantId),
      ]);
      const msg = 'Your contract is ready for signing';
      if (owner?.fcmToken)
        await this.notificationsService.sendToToken(owner.fcmToken, 'Contract Ready', msg, {
          contractId: (contract as any)._id.toString(),
          type: 'contract_signing',
        });
      if (tenant?.fcmToken)
        await this.notificationsService.sendToToken(tenant.fcmToken, 'Contract Ready', msg, {
          contractId: (contract as any)._id.toString(),
          type: 'contract_signing',
        });
    }

    this._emitContract(contract.applicationId.toString(), id);

    return contract;
  }

  async sign(contractId: string, userId: string, signatureBase64?: string) {
    const contract = await this.contractModel.findById(contractId);
    if (!contract) throw new NotFoundException('Contract not found');

    const isOwner = contract.ownerId.toString() === userId;
    const isTenant = contract.tenantId.toString() === userId;
    const isLawyer = contract.lawyerId.toString() === userId;
    if (!isOwner && !isTenant && !isLawyer)
      throw new ForbiddenException('You are not a party to this contract');

    if (!contract.content || !contract.content.trim()) {
      throw new BadRequestException(
        'Contract has no content to sign — ask the lawyer to draft it first',
      );
    }

    const user = await this.userModel.findById(userId);

    if (isOwner || isTenant) {
      const now = new Date();
      const isActive =
        !!user?.subscriptionActive &&
        !!user.subscriptionExpiresAt &&
        user.subscriptionExpiresAt > now;
      if (!isActive) {
        throw new ForbiddenException(
          'An active Aqari subscription is required to sign contracts.',
        );
      }
    }
    const signatureValue = signatureBase64 || user?.signatureUrl || 'signed';
    const update: Record<string, any> = {};

    let newStatus = contract.status;

    let topicId: string | undefined = contract.hederaTopicId;
    if (!topicId && (isOwner || isTenant) && this.hederaSigningService.isEnabled) {
      try {
        const app = await this.applicationModel
          .findById(contract.applicationId)
          .select('hcsTopicId')
          .exec();
        topicId = (app as any)?.hcsTopicId;
        if (!topicId) {
          topicId = await this.hederaSigningService.createTopic(
            `Aqari Application Fallback - ${contract.applicationId}`,
          );
        }
        update.hederaTopicId = topicId;
      } catch (e) {
        this.logger.error(`Hedera topic resolution failed for ${contractId}: ${e}`);
      }
    }

    const contractHash = createHash('sha256').update(contract.content ?? contractId).digest('hex');
    const role = isOwner ? 'owner' : isTenant ? 'tenant' : 'lawyer';

    if (topicId && this.hederaSigningService.isEnabled) {
      try {
        const txId = await this.hederaSigningService.recordSignature(topicId, {
          contractId,
          role,
          signerUserId: userId,
          signatureBase64: signatureValue,
          contractHash,
          timestamp: new Date().toISOString(),
        });
        if (isOwner) update.ownerSignatureTxId = txId;
        if (isTenant) update.tenantSignatureTxId = txId;
      } catch (e) {
        this.logger.error(`Hedera signature recording failed for ${contractId}: ${e}`);
      }
    }

    if (isLawyer && !contract.lawyerSignatureUrl) {
      update.lawyerSignatureUrl = signatureValue;
    }

    if (isOwner && !contract.ownerSignatureUrl) {
      update.ownerSignatureUrl = signatureValue;
      if (contract.status === 'pending_signatures') newStatus = 'signed_by_owner';
      else if (contract.status === 'signed_by_tenant') newStatus = 'completed';
    }

    if (isTenant && !contract.tenantSignatureUrl) {
      update.tenantSignatureUrl = signatureValue;
      if (contract.status === 'pending_signatures') newStatus = 'signed_by_tenant';
      else if (contract.status === 'signed_by_owner') newStatus = 'completed';
    }

    update.status = newStatus;
    const updated = await this.contractModel.findByIdAndUpdate(contractId, update, { new: true });

    const otherPartyId = isOwner ? contract.tenantId.toString() : contract.ownerId.toString();
    const signerLabel = isOwner ? 'Owner' : 'Tenant';
    const otherUser = await this.userModel.findById(otherPartyId);
    if (otherUser?.fcmToken && newStatus !== 'completed') {
      await this.notificationsService.sendToToken(
        otherUser.fcmToken,
        'Contract Signed',
        `${signerLabel} has signed the contract. Your signature is required.`,
        { contractId, type: 'contract_signed_partial' },
      );
    }

    if (newStatus === 'completed') {
      await this.applicationModel.findByIdAndUpdate(contract.applicationId, {
        status: 'accepted',
      });

      if (contract.type === 'sale') {
        await this.propertyModel.findByIdAndUpdate(contract.propertyId, {
          owner: contract.tenantId,
          propertyStatus: 'sold',
        });
      } else {
        await this.propertyModel.findByIdAndUpdate(contract.propertyId, {
          propertyStatus: 'rented',
        });
      }

      const [owner, tenant] = await Promise.all([
        this.userModel.findById(contract.ownerId),
        this.userModel.findById(contract.tenantId),
      ]);
      const msg = 'Contract fully signed! The agreement is now active.';
      if (owner?.fcmToken)
        await this.notificationsService.sendToToken(owner.fcmToken, 'Contract Complete', msg, {
          contractId,
          type: 'contract_completed',
        });
      if (tenant?.fcmToken)
        await this.notificationsService.sendToToken(tenant.fcmToken, 'Contract Complete', msg, {
          contractId,
          type: 'contract_completed',
        });

      if (contract.type === 'rental' || contract.type === 'rental_annex') {
        try {
          const propertyDoc = await this.applicationModel
            .findById(contract.applicationId)
            .populate('property')
            .exec();
          const propertyAddress =
            (propertyDoc?.property as any)?.Propertyaddresse ?? '';

          const created = await this.rentalsService.createFromContract({
            contractId: contractId,
            propertyId: contract.propertyId.toString(),
            ownerId: contract.ownerId.toString(),
            tenantId: contract.tenantId.toString(),
            monthlyAmount: contract.dealAmount,
            startDate: contract.startDate ?? new Date(),
            propertyAddress,
            ownerName: owner
              ? `${owner.name} ${owner.lastName}`.trim()
              : '',
            tenantName: tenant
              ? `${tenant.name} ${tenant.lastName}`.trim()
              : '',
          });
          this.logger.log(
            `Rental created for contract ${contractId}: rental=${(created as any)?._id}`,
          );
        } catch (e) {
          this.logger.error(
            `Failed to create rental for contract ${contractId}: ${e}`,
          );
        }
      }
    }

    this._emitContract(contract.applicationId.toString(), contractId);

    if (newStatus === 'completed') {
      this._emitApplication(contract.applicationId.toString());
    }

    const finalTopicId = (updated as any)?.hederaTopicId ?? topicId;
    return {
      ...(updated as any)?.toObject?.() ?? updated,
      hederaVerifyUrl: finalTopicId
        ? this.hederaSigningService.verifyUrl(finalTopicId)
        : null,
    };
  }

  async uploadDocument(id: string, lawyerId: string, documentUrl: string) {

    const contract = await this.contractModel
      .findOneAndUpdate(
        { _id: id, lawyerId },
        { documentUrl },
        { new: true },
      )
      .exec();
    if (!contract) throw new NotFoundException('Contract not found or access denied');
    return contract;
  }
}
