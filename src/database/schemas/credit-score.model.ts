import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreditScoreDocument = CreditScore & Document;

@Schema({ timestamps: true })
export class CreditScore {
    @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
    userId: Types.ObjectId;

    @Prop({ required: true, min: 0, max: 1000 })
    score: number;

    @Prop({
        type: Object,
        default: {
            incomeScore: 0,
            spendingScore: 0,
            balanceScore: 0,
            consistencyScore: 0,
            historyScore: 0,
        },
    })
    breakdown: {
        incomeScore: number;
        spendingScore: number;
        balanceScore: number;
        consistencyScore: number;
        historyScore: number;
    };

    @Prop({ required: true })
    rating: string; // EXCELLENT, GOOD, FAIR, POOR

    @Prop({ required: true, default: 0 })
    loanLimit: number;

    @Prop({ default: Date.now })
    calculatedAt: Date;
}

export const CreditScoreSchema = SchemaFactory.createForClass(CreditScore);