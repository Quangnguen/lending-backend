import {
  MongooseModuleOptions,
  MongooseOptionsFactory,
} from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AllConfigType } from '@config/config.type';

@Injectable()
export default class MongoConnectService implements MongooseOptionsFactory {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  createMongooseOptions():
    | MongooseModuleOptions
    | Promise<MongooseModuleOptions> {
    const databaseConfig = this.configService.get('database', { infer: true });

    const {
      url,
      logging,
      type,
      host,
      port,
      name,
      rejectUnauthorized,
      username,
      password,
    } = databaseConfig;

    // Set debug mode based on logging config
    mongoose.set('debug', logging);

    // If URL is provided, return the connection directly
    if (url) {
      return { uri: url };
    }

    // Create connection string based on config values
    const uri = this.buildUri({
      type,
      username,
      password,
      host,
      port,
      name,
      rejectUnauthorized,
    });

    return {
      uri,
      writeConcern: {
        w: 'majority',
      },
      autoIndex: true,
      replicaSet: 'rs0',
      readPreference: 'secondary',
    };
  }

  private buildUri({
    type,
    username,
    password,
    host,
    port,
    name,
    rejectUnauthorized,
  }: {
    type: string;
    username?: string;
    password?: string;
    host: string;
    port: number;
    name: string;
    rejectUnauthorized: boolean;
  }): string {
    // Return URI based on whether SSL verification is required
    if (rejectUnauthorized) {
      return `${type}://${host}:${port}/${name}`;
    }

    return `${type}://${username}:${password}@${host}:${port}/${name}`;
  }
}
