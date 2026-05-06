import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Contract } from './schema/contract.schema';
import { Application } from '../applications/schema/application.schema';
import { User } from '../users/schema/user.schema';
import { CreateContractDto } from './dto/create-contract.dto';
import { RentalsService } from '../rentals/rentals.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ContractsService {
  constructor(
    @InjectModel(Contract.name) private contractModel: Model<Contract>,
    @InjectModel(Application.name) private applicationModel: Model<Application>,
    @InjectModel(User.name) private userModel: Model<User>,
    private rentalsService: RentalsService,
    private notificationsService: NotificationsService,
  ) {}

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
    return contract;
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
    return this.contractModel.findByIdAndUpdate(id, body, { new: true });
  }

  async updateStatus(id: string, status: string) {
    const contract = await this.contractModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
    if (!contract) throw new NotFoundException('Contract not found');

    // Notify owner + tenant when sent for signatures
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

    return contract;
  }

  async sign(contractId: string, userId: string) {
    const contract = await this.contractModel.findById(contractId);
    if (!contract) throw new NotFoundException('Contract not found');

    const isOwner = contract.ownerId.toString() === userId;
    const isTenant = contract.tenantId.toString() === userId;
    const isLawyer = contract.lawyerId.toString() === userId;
    if (!isOwner && !isTenant && !isLawyer)
      throw new ForbiddenException('You are not a party to this contract');

    const user = await this.userModel.findById(userId);
    const signatureValue = user?.signatureUrl || 'signed';
    const update: Record<string, any> = {};

    let newStatus = contract.status;

    // Lawyer signs the draft before dispatching to owner + tenant
    if (isLawyer && !contract.lawyerSignatureUrl) {
      update.lawyerSignatureUrl = signatureValue;
      // Status stays as-is; lawyer then explicitly sends for signatures
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

    // Notify the other party about partial signature
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

    // Both signed → finalize
    if (newStatus === 'completed') {
      await this.applicationModel.findByIdAndUpdate(contract.applicationId, {
        status: 'accepted',
      });

      // Notify both parties
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

      // Auto-create rental record for rental-type contracts
      if (contract.type === 'rental' || contract.type === 'rental_annex') {
        const propertyDoc = await this.applicationModel
          .findById(contract.applicationId)
          .populate('property')
          .exec();
        const propertyAddress =
          (propertyDoc?.property as any)?.Propertyaddresse ?? '';

        await this.rentalsService.createFromContract({
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
      }
    }

    return updated;
  }

  async uploadDocument(id: string, documentUrl: string) {
    const contract = await this.contractModel
      .findByIdAndUpdate(id, { documentUrl }, { new: true })
      .exec();
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }
}
