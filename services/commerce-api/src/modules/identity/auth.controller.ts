import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { loadServerEnv } from '@novamart/config';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly env = loadServerEnv();

  @Public()
  @Get('config')
  config() {
    return {
      supabaseUrl: this.env.SUPABASE_URL,
      issuer: this.env.SUPABASE_JWT_ISSUER ?? `${this.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`,
      audience: this.env.SUPABASE_JWT_AUDIENCE,
      providers: ['phone_otp', 'email', 'google', 'apple'],
      mfa: { privilegedActions: true },
    };
  }
}
