import { File, FileSchema } from './file.model';
import { User, UserSchema } from './user.model';
import { Contact, ContactSchema } from './contact.model';

export const schemas = [
  {
    name: User.name,
    schema: UserSchema,
  },
  {
    name: File.name,
    schema: FileSchema,
  },
  {
    name: Contact.name,
    schema: ContactSchema,
  },
];
