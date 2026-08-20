import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthTokens> {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.users.save(
      this.users.create({ email: dto.email, passwordHash, name: dto.name }),
    );

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    // Deliberately generic error - don't reveal whether the email exists.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    // tokenVersion mismatch means this token was already rotated away (reused
    // token) or the user logged out everywhere - reject either way.
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }

    return this.issueTokens(user);
  }

  // Invalidates every outstanding refresh token for this user (logout of all devices).
  async logoutAll(userId: string): Promise<void> {
    await this.users.increment({ id: userId }, 'tokenVersion', 1);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, tokenVersion: user.tokenVersion } as RefreshTokenPayload,
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      },
    );

    return { accessToken, refreshToken };
  }
}
