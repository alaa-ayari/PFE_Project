import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Application } from './schema/application.schema';
import { ApplicationMessage } from './schema/application-message.schema';
import { Property } from '../property/schema/property.schema';
import { User } from '../users/schema/user.schema';
import { CreateApplicationDto, UpdateApplicationStatusDto, CreateMessageDto } from './dto/create-application.dto';
import { NotificationsService } from '../notifications/notifications.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['under_review', 'rejected', 'cancelled', 'visit_scheduled'],
  under_review: ['visit_scheduled', 'pre_approved', 'rejected', 'cancelled'],
  visit_scheduled: ['pre_approved', 'rejected', 'cancelled'],
  pre_approved: ['accepted', 'rejected', 'cancelled'],
  accepted: ['negotiation', 'rejected'],
  negotiation: ['awaiting_lawyer'],
  awaiting_lawyer: ['contract_drafting'],
  contract_drafting: [],
  rejected: [],
  cancelled: [],
};

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

const STATUS_LABELS: Record<string, string> = {
  under_review: 'Under Review',
  visit_scheduled: 'Visit Scheduled',
  pre_approved: 'Pre-Approved',
  accepted: 'Accepted',
  negotiation: 'In Negotiation',
  awaiting_lawyer: 'Awaiting Lawyer',
  contract_drafting: 'Contract Drafting',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name) private applicationModel: Model<Application>,
    @InjectModel(ApplicationMessage.name) private messageModel: Model<ApplicationMessage>,
    @InjectModel(Property.name) private propertyModel: Model<Property>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly notificationsService: NotificationsService,
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

    // Notify the property owner about the new application
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

    // Notify the applicant about the status change
    this._notifyApplicant(application.applicant.toString(), dto.status).catch(() => {});

    return updated;
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
    const application = await this.applicationModel.findById(id).exec();
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
    return updated!.toObject();
  }

  // ── Lawyer cases ─────────────────────────────────────────────────────────

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

  // ── Deal amount / negotiation ────────────────────────────────────────────

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

    return application.save();
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

    return application.save();
  }

  // ── Messages ────────────────────────────────────────────────────────────

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
    return saved.populate({ path: 'sender', select: 'name lastName profileImageUrl' });
  }
}
