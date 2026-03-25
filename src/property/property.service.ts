import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from './schema/property.schema';

@Injectable()
export class PropertyService {
  constructor(
    @InjectModel(Property.name) private propertyModel: Model<Property>,
  ) {}

  async create(createPropertyDto: CreatePropertyDto) {
    const createdProperty = new this.propertyModel(createPropertyDto);
    const saved = await createdProperty.save();
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

  async update(id: string, updatePropertyDto: UpdatePropertyDto) {
    const updated = await this.propertyModel
      .findByIdAndUpdate(id, updatePropertyDto, { returnDocument: 'after' })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    return updated;
  }

  async remove(id: string) {
    const deleted = await this.propertyModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }
    return {
      message: 'Property deleted successfully',
      id: deleted._id,
    };
  }

  async addImages(id: string, imagePaths: string[]) {
    const property = await this.propertyModel.findById(id).exec();
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    // Migrate: old documents may have propertyimage (string) or propertyimages (string)
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

  async updateDocument(id: string, documentPath: string) {
    const updated = await this.propertyModel
      .findByIdAndUpdate(id, { Registrationdocument: documentPath }, { returnDocument: 'after' })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    return updated;
  }
}
