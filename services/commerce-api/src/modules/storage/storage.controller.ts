import { Body, Controller, Post } from '@nestjs/common';
import { requestUploadSchema } from '@novamart/validation';
import { parse } from '../../common/validation';
import { StorageService } from './storage.service';

@Controller({ path: 'storage', version: '1' })
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('uploads/sign')
  async sign(@Body() body: unknown) { return this.storage.createUpload(parse(requestUploadSchema, body)); }
}
