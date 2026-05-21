import * as mongoose from 'mongoose';
import { encrypt, decrypt } from './src/core/utils/encryption.util';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/p2p-lending';

async function migrate() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');
    const KycSchema = new mongoose.Schema({}, { strict: false });
    const KycModel = mongoose.model('KycRecord', KycSchema, 'kyc_records');

    const records = await KycModel.find({}).lean();
    let migratedCount = 0;
    let skippedCount = 0;

    for (const record of records as any[]) {
        if (!record.idInfo) {
            skippedCount++;
            continue;
        }

        let isUpdated = false;
        const newIdInfo = { ...record.idInfo };

        // Check if id is already encrypted (contains ':')
        if (newIdInfo.id && typeof newIdInfo.id === 'string' && !newIdInfo.id.includes(':')) {
            newIdInfo.id = encrypt(newIdInfo.id);
            isUpdated = true;
        }

        // Check if name is already encrypted (contains ':')
        if (newIdInfo.name && typeof newIdInfo.name === 'string' && !newIdInfo.name.includes(':')) {
            newIdInfo.name = encrypt(newIdInfo.name);
            isUpdated = true;
        }

        if (isUpdated) {
            await KycModel.updateOne(
                { _id: record._id },
                { $set: { idInfo: newIdInfo } }
            );
            migratedCount++;
            console.log(`Migrated KycRecord ${record._id}`);
        } else {
            skippedCount++;
        }
    }

    console.log(`Migration complete! Migrated: ${migratedCount}, Skipped: ${skippedCount}`);
    process.exit(0);
}

migrate().catch(console.error);
