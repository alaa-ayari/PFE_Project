// Rental application lifecycle: creation, status FSM, messages, visit and price proposals, lawyer assignment.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { Application } from './schema/application.schema';
import { ApplicationMessage } from './schema/application-message.schema';
import { Property } from '../property/schema/property.schema';
import { User } from '../users/schema/user.schema';
import {
  CreateApplicationDto,
  UpdateApplicationStatusDto,
  CreateMessageDto,
  ProposeVisitDto,
  RespondProposalDto,
  ProposePriceDto,
  SetConditionsDto,
} from './dto/create-application.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingGateway } from './messaging.gateway';
import { HederaService } from '../hedera/hedera.service';
import { VALID_TRANSITIONS, STATUS_LABELS as _STATUS_LABELS } from './application-status.constants';
import { UserRole } from '../users/schema/Role_enum';

const PROPERTY_POPULATE = {
  path: 'property',
  select: 'Propertyaddresse propertyimages owner PropertyType propertyStatus description',
  populate: {
    path: 'owner',
    select: 'name lastName email profileImageUrl identitynumber dateOfBirth placeOfBirth address issueDate issuePlace',
  },
};

const APPLICANT_POPULATE = {
  path: 'applicant',
  select: 'name lastName email phoneNumber profileImageUrl identitynumber dateOfBirth placeOfBirth address issueDate issuePlace signatureUrl faceRegistered isVerified',
};

const STATUS_LABELS = _STATUS_LABELS;

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @InjectModel(Application.name) private applicationModel: Model<Application>,
    @InjectModel(ApplicationMessage.name) private messageModel: Model<ApplicationMessage>,
    @InjectModel(Property.name) private propertyModel: Model<Property>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly notificationsService: NotificationsService,
    private readonly messagingGateway: MessagingGateway,
    private readonly hederaService: HederaService,
  ) {}

  async create(userId: string, dto: CreateApplicationDto) {
    const property = await this.propertyModel.findById(dto.propertyId).exec();
    if (!property) {
      throw new NotFoundException(`Property with ID ${dto.propertyId} not found`);
    }

    if (property.owner.toString() === userId) {
      throw new BadRequestException('You cannot apply to your own property');
    }

    const existing = await this.applicationModel.findOne({
      property: dto.propertyId,
      applicant: userId,
      status: { $nin: ['cancelled', 'rejected'] },
    }).exec();
    if (existing) {
      throw new BadRequestException('You already have an active application for this property');
    }

    const application = new this.applicationModel({
      property: dto.propertyId,
      applicant: userId,
      type: dto.type,
      message: dto.message,
    });
    const saved = await application.save();

    if (this.hederaService.isEnabled) {
      this.hederaService
        .createTopic(`Aqari Application - ${saved._id}`)
        .then(async (topicId) => {
          await this.applicationModel.findByIdAndUpdate(saved._id, { hcsTopicId: topicId });
          this.logger.log(`Application ${saved._id} bound to HCS topic ${topicId}`);
        })
        .catch((e) => this.logger.error(`Topic creation failed for app ${saved._id}: ${e}`));
    }

    const ownerId = property.owner.toString();
    this.userModel.findById(ownerId).select('fcmToken').exec().then((owner) => {
      if (owner?.fcmToken) {
        this.notificationsService.sendToToken(
          owner.fcmToken,
          'New Application',
          'Someone applied to one of your properties.',
          { applicationId: saved._id.toString() },
        ).catch(() => {});
      }
    }).catch(() => {});

    return saved.toObject();
  }

  async findMyApplications(userId: string) {
    return this.applicationModel
      .find({ applicant: userId })
      .populate(PROPERTY_POPULATE)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findIncomingApplications(userId: string) {
    const myProperties = await this.propertyModel
      .find({ owner: userId })
      .select('_id')
      .exec();
    const propertyIds = myProperties.map((p) => p._id);

    return this.applicationModel
      .find({ property: { $in: propertyIds } })
      .populate(PROPERTY_POPULATE)
      .populate(APPLICANT_POPULATE)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByProperty(propertyId: string, userId: string) {
    const property = await this.propertyModel.findById(propertyId).exec();
    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }
    if (property.owner.toString() !== userId) {
      throw new ForbiddenException('You can only view applications for your own properties');
    }

    return this.applicationModel
      .find({ property: propertyId })
      .populate(APPLICANT_POPULATE)
      .populate(PROPERTY_POPULATE)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findMyApplicationForProperty(propertyId: string, userId: string) {
    const application = await this.applicationModel
      .findOne({ property: propertyId, applicant: userId })
      .populate(PROPERTY_POPULATE)
      .exec();
    if (!application) {
      throw new NotFoundException('No application found for this property');
    }
    return application;
  }

  async findById(id: string, userId: string) {
    const application = await this.applicationModel
      .findById(id)
      .populate(PROPERTY_POPULATE)
      .populate(APPLICANT_POPULATE)
      .exec();
    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    const applicantId = (application.applicant as any)?._id?.toString?.() ?? application.applicant?.toString();
    const ownerId = (application.property as any)?.owner?._id?.toString?.()
      ?? (application.property as any)?.owner?.toString();

    if (applicantId !== userId && ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this application');
    }
    return application;
  }

  async updateStatus(id: string, userId: string, dto: UpdateApplicationStatusDto) {
    const application = await this.applicationModel
      .findById(id)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    const ownerId = (application.property as any)?.owner?.toString();
    if (ownerId !== userId) {
      throw new ForbiddenException('Only the property owner can update application status');
    }

    const allowed = VALID_TRANSITIONS[application.status];
    if (!allowed || !allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from "${application.status}" to "${dto.status}"`,
      );
    }

    const updateFields: Record<string, any> = { status: dto.status };
    if (dto.note !== undefined) updateFields.note = dto.note;
    if (dto.rejectionReason !== undefined) updateFields.rejectionReason = dto.rejectionReason;
    if (dto.visitDate !== undefined) updateFields.visitDate = new Date(dto.visitDate);

    const updated = await this.applicationModel
      .findByIdAndUpdate(id, updateFields, { returnDocument: 'after' })
      .populate(PROPERTY_POPULATE)
      .populate(APPLICANT_POPULATE)
      .exec();

    this._notifyApplicant(application.applicant.toString(), dto.status).catch(() => {});
    this._emitUpdate(id);

    return updated;
  }

  private async _emitUpdate(applicationId: string) {
    try {
      const populated = await this.applicationModel
        .findById(applicationId)
        .populate(PROPERTY_POPULATE)
        .populate(APPLICANT_POPULATE)
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
      this.logger.error(`emitUpdate failed for ${applicationId}: ${e}`);
    }
  }

  private async _notifyApplicant(applicantId: string, newStatus: string) {
    const user = await this.userModel.findById(applicantId).select('fcmToken').exec();
    if (!user?.fcmToken) return;
    const label = STATUS_LABELS[newStatus] ?? newStatus;
    await this.notificationsService.sendToToken(
      user.fcmToken,
      'Application Update',
      `Your application status changed to: ${label}`,
      { status: newStatus },
    );
  }

  async cancel(id: string, userId: string) {
    const application = await this.applicationModel
      .findById(id)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }
    if (application.applicant.toString() !== userId) {
      throw new ForbiddenException('You can only cancel your own applications');
    }

    const allowed = VALID_TRANSITIONS[application.status];
    if (!allowed || !allowed.includes('cancelled')) {
      throw new BadRequestException(
        `Cannot cancel application with status "${application.status}"`,
      );
    }

    const updated = await this.applicationModel
      .findByIdAndUpdate(id, { status: 'cancelled' }, { returnDocument: 'after' })
      .exec();

    const ownerId = (application.property as any)?.owner?.toString();
    if (ownerId) {
      this._notifyUser(
        ownerId,
        'Application Cancelled',
        'An applicant has withdrawn their application.',
        { applicationId: id, type: 'application_cancelled' },
      ).catch(() => {});
    }
    this._emitUpdate(id);
    return updated!.toObject();
  }

  async getLawyerCases(lawyerId: string) {
    return this.applicationModel
      .find({
        lawyer: lawyerId,
        status: { $in: ['awaiting_lawyer', 'contract_drafting'] },
      })
      .populate(PROPERTY_POPULATE)
      .populate(APPLICANT_POPULATE)
      .populate({ path: 'lawyer', select: 'name lastName email profileImageUrl' })
      .sort({ createdAt: -1 })
      .exec();
  }

  async setDealAmount(applicationId: string, amount: number, requesterId: string) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const ownerId = (application.property as any)?.owner?.toString();
    if (ownerId !== requesterId) {
      throw new ForbiddenException('Only the property owner can set the deal amount');
    }

    const current = application.status;
    if (!VALID_TRANSITIONS[current]?.includes('negotiation')) {
      throw new BadRequestException(
        `Cannot set amount from status "${current}" — application must be accepted first`,
      );
    }

    application.dealAmount = amount;
    application.status = 'negotiation';
    (application.statusHistory as any[]).push({
      fromStatus: current,
      toStatus: 'negotiation',
      changedBy: requesterId,
      note: `Deal amount set to ${amount}`,
      createdAt: new Date(),
    });

    const saved = await application.save();
    this._notifyUser(
      application.applicant.toString(),
      'Deal Amount Set',
      `The owner has proposed a deal amount of ${amount} TND`,
      { applicationId, type: 'deal_amount' },
    ).catch(() => {});
    this._emitUpdate(applicationId);
    return saved;
  }

  async assignLawyer(applicationId: string, lawyerId: string, requesterId: string) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const ownerId = (application.property as any)?.owner?.toString();
    if (ownerId !== requesterId) {
      throw new ForbiddenException('Only the property owner can assign a lawyer');
    }

    const lawyerUser = await this.userModel.findById(lawyerId).select('role').exec();
    if (!lawyerUser || lawyerUser.role !== UserRole.LAWYER) {
      throw new BadRequestException('Assigned user must be a registered lawyer');
    }

    const current = application.status;
    if (!VALID_TRANSITIONS[current]?.includes('awaiting_lawyer')) {
      throw new BadRequestException(
        `Cannot assign lawyer from status "${current}" — application must be in negotiation first`,
      );
    }

    (application as any).lawyer = lawyerId;
    application.status = 'awaiting_lawyer';
    (application.statusHistory as any[]).push({
      fromStatus: current,
      toStatus: 'awaiting_lawyer',
      changedBy: requesterId,
      note: `Lawyer assigned`,
      createdAt: new Date(),
    });

    const saved = await application.save();

    this._notifyUser(
      application.applicant.toString(),
      'Lawyer Assigned',
      'The owner has selected a lawyer to draft your contract.',
      { applicationId, type: 'lawyer_assigned' },
    ).catch(() => {});
    this._notifyUser(
      lawyerId,
      'New Case Assigned',
      'You have been assigned to draft a rental contract.',
      { applicationId, type: 'lawyer_assigned' },
    ).catch(() => {});

    this._emitUpdate(applicationId);
    return saved;
  }

  private async _ensureTopic(application: Application): Promise<string | null> {
    if (!this.hederaService.isEnabled) return null;
    if ((application as any).hcsTopicId) return (application as any).hcsTopicId;
    try {
      const topicId = await this.hederaService.createTopic(
        `Aqari Application - ${application._id}`,
      );
      await this.applicationModel.findByIdAndUpdate(application._id, { hcsTopicId: topicId });
      (application as any).hcsTopicId = topicId;
      return topicId;
    } catch (e) {
      this.logger.error(`Topic backfill failed for ${application._id}: ${e}`);
      return null;
    }
  }

  private async _submitConsent(
    application: Application,
    payload: Record<string, any>,
  ): Promise<{ txId?: string; sequenceNumber?: number }> {
    const topicId = await this._ensureTopic(application);
    if (!topicId) return {};
    try {
      const res = await this.hederaService.submitMessage(topicId, {
        applicationId: application._id.toString(),
        ...payload,
        timestamp: new Date().toISOString(),
      });
      return {
        txId: res.transactionId,
        sequenceNumber: res.sequenceNumber ?? undefined,
      };
    } catch (e) {
      this.logger.error(`HCS submit failed for ${application._id}: ${e}`);
      return {};
    }
  }

  private _resolveParticipants(application: Application & { property: any }): {
    ownerId: string;
    applicantId: string;
  } {
    const ownerId =
      (application.property as any)?.owner?._id?.toString?.() ??
      (application.property as any)?.owner?.toString();
    const applicantId =
      (application.applicant as any)?._id?.toString?.() ??
      application.applicant?.toString();
    return { ownerId, applicantId };
  }

  async proposeVisit(applicationId: string, userId: string, dto: ProposeVisitDto) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const { ownerId, applicantId } = this._resolveParticipants(application as any);
    if (userId !== ownerId && userId !== applicantId) {
      throw new ForbiddenException('Only application participants may propose a visit');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt');
    }

    (application.visitProposals as any[]).forEach((p) => {
      if (p.status === 'pending') p.status = 'rejected';
    });

    const proposalId = randomUUID();
    const { txId, sequenceNumber } = await this._submitConsent(application, {
      kind: 'visit_proposal',
      proposalId,
      proposedBy: userId,
      scheduledAt: scheduledAt.toISOString(),
      location: dto.location ?? null,
    });

    (application.visitProposals as any[]).push({
      proposalId,
      proposedBy: userId,
      scheduledAt,
      location: dto.location,
      status: 'pending',
      hcsTxId: txId,
      hcsSequenceNumber: sequenceNumber,
      createdAt: new Date(),
    });

    await application.save();

    const otherPartyId = userId === ownerId ? applicantId : ownerId;
    this._notifyUser(otherPartyId, 'Visit Proposed', 'A visit time has been proposed for your application.', {
      applicationId,
      type: 'visit_proposal',
    }).catch(() => {});
    this._emitUpdate(applicationId);

    return application.toObject();
  }

  async respondToVisitProposal(
    applicationId: string,
    proposalId: string,
    userId: string,
    dto: RespondProposalDto,
  ) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const { ownerId, applicantId } = this._resolveParticipants(application as any);
    if (userId !== ownerId && userId !== applicantId) {
      throw new ForbiddenException('Only application participants may respond');
    }

    const proposal = (application.visitProposals as any[]).find(
      (p) => p.proposalId === proposalId,
    );
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'pending') {
      throw new BadRequestException(`Proposal is already ${proposal.status}`);
    }
    if (proposal.proposedBy.toString() === userId) {
      throw new ForbiddenException('You cannot respond to your own proposal');
    }

    const decision = dto.decision === 'accept' ? 'accepted' : 'rejected';
    const { txId, sequenceNumber } = await this._submitConsent(application, {
      kind: 'visit_response',
      proposalId,
      respondedBy: userId,
      decision,
    });

    proposal.status = decision;
    proposal.respondedBy = userId;
    proposal.respondedAt = new Date();
    if (txId) proposal.hcsTxId = txId;
    if (sequenceNumber) proposal.hcsSequenceNumber = sequenceNumber;

    if (decision === 'accepted') {
      application.visitDate = proposal.scheduledAt;
      const fromStatus = application.status;
      if (fromStatus === 'pending' || fromStatus === 'under_review') {
        application.status = 'visit_scheduled';
        (application.statusHistory as any[]).push({
          fromStatus,
          toStatus: 'visit_scheduled',
          changedBy: userId,
          note: 'Visit proposal accepted',
          createdAt: new Date(),
        });
      }
    }

    await application.save();

    const otherPartyId = userId === ownerId ? applicantId : ownerId;
    const verb = decision === 'accepted' ? 'accepted' : 'rejected';
    this._notifyUser(otherPartyId, 'Visit Response', `Your visit proposal was ${verb}.`, {
      applicationId,
      type: 'visit_response',
    }).catch(() => {});
    this._emitUpdate(applicationId);

    return application.toObject();
  }

  async proposePrice(applicationId: string, userId: string, dto: ProposePriceDto) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const { ownerId, applicantId } = this._resolveParticipants(application as any);
    if (userId !== ownerId && userId !== applicantId) {
      throw new ForbiddenException('Only application participants may propose a price');
    }

    if (typeof dto.amount !== 'number' || dto.amount <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    (application.priceProposals as any[]).forEach((p) => {
      if (p.status === 'pending') p.status = 'rejected';
    });

    const proposalId = randomUUID();
    const { txId, sequenceNumber } = await this._submitConsent(application, {
      kind: 'price_proposal',
      proposalId,
      proposedBy: userId,
      amount: dto.amount,
      terms: dto.terms ?? null,
    });

    (application.priceProposals as any[]).push({
      proposalId,
      proposedBy: userId,
      amount: dto.amount,
      terms: dto.terms,
      status: 'pending',
      hcsTxId: txId,
      hcsSequenceNumber: sequenceNumber,
      createdAt: new Date(),
    });

    await application.save();

    const otherPartyId = userId === ownerId ? applicantId : ownerId;
    this._notifyUser(
      otherPartyId,
      'Price Proposed',
      `A new price has been proposed: ${dto.amount}`,
      { applicationId, type: 'price_proposal' },
    ).catch(() => {});
    this._emitUpdate(applicationId);

    return application.toObject();
  }

  async respondToPriceProposal(
    applicationId: string,
    proposalId: string,
    userId: string,
    dto: RespondProposalDto,
  ) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const { ownerId, applicantId } = this._resolveParticipants(application as any);
    if (userId !== ownerId && userId !== applicantId) {
      throw new ForbiddenException('Only application participants may respond');
    }

    const proposal = (application.priceProposals as any[]).find(
      (p) => p.proposalId === proposalId,
    );
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'pending') {
      throw new BadRequestException(`Proposal is already ${proposal.status}`);
    }
    if (proposal.proposedBy.toString() === userId) {
      throw new ForbiddenException('You cannot respond to your own proposal');
    }

    const decision = dto.decision === 'accept' ? 'accepted' : 'rejected';
    const { txId, sequenceNumber } = await this._submitConsent(application, {
      kind: 'price_response',
      proposalId,
      respondedBy: userId,
      decision,
      amount: proposal.amount,
    });

    proposal.status = decision;
    proposal.respondedBy = userId;
    proposal.respondedAt = new Date();
    if (txId) proposal.hcsTxId = txId;
    if (sequenceNumber) proposal.hcsSequenceNumber = sequenceNumber;

    if (decision === 'accepted') {
      application.dealAmount = proposal.amount;
      (application as any).agreedAmount = proposal.amount;
      (application as any).agreedTerms = proposal.terms;

      const fromStatus = application.status;
      if (
        fromStatus !== 'negotiation' &&
        VALID_TRANSITIONS[fromStatus]?.includes('negotiation')
      ) {
        application.status = 'negotiation';
        (application.statusHistory as any[]).push({
          fromStatus,
          toStatus: 'negotiation',
          changedBy: userId,
          note: `Price ${proposal.amount} agreed`,
          createdAt: new Date(),
        });
      }
    }

    await application.save();

    const otherPartyId = userId === ownerId ? applicantId : ownerId;
    const verb = decision === 'accepted' ? 'accepted' : 'rejected';
    this._notifyUser(
      otherPartyId,
      'Price Response',
      `Your price proposal was ${verb}.`,
      { applicationId, type: 'price_response' },
    ).catch(() => {});
    this._emitUpdate(applicationId);

    return application.toObject();
  }

  async setRequesterConditions(
    applicationId: string,
    userId: string,
    dto: SetConditionsDto,
  ) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const { applicantId } = this._resolveParticipants(application as any);
    if (userId !== applicantId) {
      throw new ForbiddenException('Only the applicant may set conditions');
    }

    (application as any).requesterConditions = dto.conditions ?? '';
    await this._submitConsent(application, {
      kind: 'conditions_set',
      conditions: dto.conditions ?? '',
    });
    await application.save();

    const ownerId = (application.property as any)?.owner?.toString();
    if (ownerId) {
      this._notifyUser(
        ownerId,
        'Conditions Updated',
        'The applicant updated their contract conditions.',
        { applicationId, type: 'conditions_set' },
      ).catch(() => {});
    }

    this._emitUpdate(applicationId);
    return application.toObject();
  }

  private async _notifyUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const user = await this.userModel.findById(userId).select('fcmToken').exec();
    if (!user?.fcmToken) return;
    await this.notificationsService.sendToToken(user.fcmToken, title, body, data);
  }

  async getMessages(applicationId: string, userId: string) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) {
      throw new NotFoundException(`Application with ID ${applicationId} not found`);
    }

    const applicantId = application.applicant.toString();
    const ownerId = (application.property as any)?.owner?.toString();
    if (applicantId !== userId && ownerId !== userId) {
      throw new ForbiddenException('You do not have access to these messages');
    }

    return this.messageModel
      .find({ application: applicationId })
      .populate({ path: 'sender', select: 'name lastName profileImageUrl' })
      .sort({ createdAt: 1 })
      .exec();
  }

  async sendMessage(applicationId: string, userId: string, dto: CreateMessageDto) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate({ path: 'property', select: 'owner' })
      .exec();
    if (!application) {
      throw new NotFoundException(`Application with ID ${applicationId} not found`);
    }

    const applicantId = application.applicant.toString();
    const ownerId = (application.property as any)?.owner?.toString();
    if (applicantId !== userId && ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this conversation');
    }

    const message = new this.messageModel({
      application: applicationId,
      sender: userId,
      content: dto.content,
    });
    const saved = await message.save();
    const populated = await saved.populate({ path: 'sender', select: 'name lastName profileImageUrl' });
    this.messagingGateway.emitNewMessage(applicationId, populated);
    const otherPartyId = userId === ownerId ? applicantId : ownerId;

    if (otherPartyId) {
      this.messagingGateway.emitToUsers(
        [otherPartyId],
        'newMessage',
        populated,
      );
      this._notifyUser(
        otherPartyId,
        'New Message',
        'You have a new message',
        { applicationId, type: 'new_message' },
      ).catch(() => {});
    }
    return populated;
  }
}
