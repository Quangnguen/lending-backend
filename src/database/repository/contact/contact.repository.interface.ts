import { Contact } from '@database/schemas/contact.model';
import { BaseInterfaceRepository } from '@core/repository/base.interface.repository';
import { CreateContactRequestDto } from '@components/contact/dto/request/create-contact.request.dto';
import { GetListContactRequestDto } from '@components/contact/dto/request/get-list-contact.request.dto';

export interface ContactRepositoryInterface
  extends BaseInterfaceRepository<Contact> {
  createEntity(data: CreateContactRequestDto): Contact;

  getDetail(id: string): Promise<Contact | null>;

  list(
    request: GetListContactRequestDto,
    isExport?: boolean,
  ): Promise<{ data: Contact[]; total: number }>;
}
