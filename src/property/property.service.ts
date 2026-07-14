// Property CRUD, search, image and document upload.

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from './schema/property.schema';
import { Contract } from '../contracts/schema/contract.schema';
import { User } from '../users/schema/user.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PropertyService {
  constructor(
    @InjectModel(Property.name) private propertyModel: Model<Property>,
    @InjectModel(Contract.name) private contractModel: Model<Contract>,
    @InjectModel(User.name) private userModel: Model<User>,
    private notificationsService: NotificationsService,
  ) {}

  async create(createPropertyDto: CreatePropertyDto) {
    const createdProperty = new this.propertyModel(createPropertyDto);
    const saved = await createdProperty.save();
    const ownerId = (saved as any).owner?.toString();
    if (ownerId) {
      const owner = await this.userModel.findById(ownerId).select('fcmToken').exec();
      if (owner?.fcmToken) {
        this.notificationsService
          .sendToToken(
            owner.fcmToken,
            'Property Listed',
            'Your property has been listed successfully',
            { propertyId: (saved as any)._id.toString(), type: 'property_listed' },
          )
          .catch(() => {});
      }
    }
    return saved;
  }

  async findAll() {
    return this.propertyModel.find().populate('owner', 'name lastName email phoneNumber').exec();
  }

  async findByOwner(ownerId: string) {
    return this.propertyModel.find({ owner: ownerId }).populate('owner', 'name lastName email phoneNumber').exec();
  }

  async findForSale() {
    return this.propertyModel.find({ PropertyType: 'sale' }).populate('owner', 'name lastName email phoneNumber').exec();
  }

  async findForRent() {
    return this.propertyModel.find({ PropertyType: 'rent' }).populate('owner', 'name lastName email phoneNumber').exec();
  }

  async findOne(id: string) {
    const property = await this.propertyModel.findById(id).populate('owner', 'name lastName email phoneNumber').exec();
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }
    return property;
  }

  private async _assertOwnership(id: string, requesterId: string) {
    const property = await this.propertyModel.findById(id).exec();
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }
    if (property.owner.toString() !== requesterId) {
      throw new ForbiddenException('You can only modify your own properties');
    }
    return property;
  }

  async update(id: string, requesterId: string, updatePropertyDto: UpdatePropertyDto) {
    await this._assertOwnership(id, requesterId);

    const updated = await this.propertyModel
      .findByIdAndUpdate(id, { $set: { ...updatePropertyDto } }, { returnDocument: 'after' })
      .exec();
    return updated;
  }

  async remove(id: string, requesterId: string) {
    await this._assertOwnership(id, requesterId);
    const deleted = await this.propertyModel.findByIdAndDelete(id).exec();
    return {
      message: 'Property deleted successfully',
      id: deleted!._id,
    };
  }

  async addImages(id: string, requesterId: string, imagePaths: string[]) {
    const property = await this._assertOwnership(id, requesterId);

    const raw = property.toObject() as any;
    let existing: string[] = [];
    if (Array.isArray(raw.propertyimages)) {
      existing = raw.propertyimages;
    } else if (typeof raw.propertyimages === 'string' && raw.propertyimages) {
      existing = [raw.propertyimages];
    } else if (typeof raw.propertyimage === 'string' && raw.propertyimage) {
      existing = [raw.propertyimage];
    }

    const updated = await this.propertyModel
      .findByIdAndUpdate(
        id,
        { $set: { propertyimages: [...existing, ...imagePaths] } },
        { returnDocument: 'after' },
      )
      .exec();

    return updated;
  }

  async updateDocument(id: string, requesterId: string, documentPath: string) {
    await this._assertOwnership(id, requesterId);
    const updated = await this.propertyModel
      .findByIdAndUpdate(
        id,
        { $set: { Registrationdocument: documentPath } },
        { returnDocument: 'after' },
      )
      .exec();
    return updated;
  }

  async getLedger(propertyId: string) {
    const property = await this.propertyModel
      .findById(propertyId)
      .populate('owner', 'name lastName email phoneNumber')
      .exec();
    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    const contracts = await this.contractModel
      .find({ propertyId, status: 'completed' })
      .populate('ownerId', 'name lastName email')
      .populate('tenantId', 'name lastName email')
      .populate('lawyerId', 'name lastName')
      .sort({ updatedAt: 1 })
      .exec();

    const sales = contracts.filter((c) => c.type === 'sale');
    const ownership: Array<{
      owner: any;
      from: Date | null;
      to: Date | null;
      transferContractId: string | null;
      transferTopicId: string | null;
      transferTxId: string | null;
      isCurrent: boolean;
    }> = [];

    if (sales.length === 0) {
      ownership.push({
        owner: property.owner,
        from: (property as any).createdAt ?? null,
        to: null,
        transferContractId: null,
        transferTopicId: null,
        transferTxId: null,
        isCurrent: true,
      });
    } else {

      ownership.push({
        owner: (sales[0] as any).ownerId,
        from: (property as any).createdAt ?? null,
        to: (sales[0] as any).updatedAt ?? null,
        transferContractId: null,
        transferTopicId: null,
        transferTxId: null,
        isCurrent: false,
      });
      for (let i = 0; i < sales.length; i++) {
        const sale: any = sales[i];
        const next: any = sales[i + 1];
        ownership.push({
          owner: sale.tenantId,
          from: sale.updatedAt ?? null,
          to: next ? (next.updatedAt ?? null) : null,
          transferContractId: sale._id?.toString() ?? null,
          transferTopicId: sale.hederaTopicId ?? null,
          transferTxId: sale.tenantSignatureTxId ?? null,
          isCurrent: !next,
        });
      }
    }

    const contractEntries = contracts.map((c: any) => {
      const topicId = c.hederaTopicId ?? null;
      return {
        id: c._id?.toString(),
        type: c.type,
        status: c.status,
        dealAmount: c.dealAmount,
        startDate: c.startDate ?? null,
        endDate: c.endDate ?? null,
        owner: c.ownerId,
        tenant: c.tenantId,
        lawyer: c.lawyerId,
        hederaTopicId: topicId,
        hederaVerifyUrl: topicId
          ? `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`
          : null,
        ownerSignatureTxId: c.ownerSignatureTxId ?? null,
        tenantSignatureTxId: c.tenantSignatureTxId ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    return {
      propertyId,
      currentOwner: property.owner,
      propertyCreatedAt: (property as any).createdAt ?? null,
      ownership,
      contracts: contractEntries,
    };
  }
}
