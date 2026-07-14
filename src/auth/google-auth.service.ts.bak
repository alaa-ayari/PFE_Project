import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GoogleUserPayload {
  googleId: string;
  email: string;
  name: string;
  lastName: string;
  profileImageUrl?: string;
}

// ⭐ ADD THIS: Interface for Google's userinfo API response
interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
}

@Injectable()
export class GoogleAuthService {
  private oauthClient: OAuth2Client;

  constructor(private configService: ConfigService) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.oauthClient = new OAuth2Client(clientId);
  }

  /**
   * Verify Google ID token (from mobile) and extract user information
   */
  async verifyIdToken(idToken: string): Promise<GoogleUserPayload> {
    try {
      const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      
      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: clientId,
      });

      const payload: TokenPayload | undefined = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Invalid Google token');
      }

      if (!payload.email) {
        throw new BadRequestException('Google account does not have an email');
      }

      return this.extractUserInfo(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to verify Google ID token: ' + error.message);
    }
  }

  /**
   * Verify Google access token (from web) and extract user information
   */
  async verifyAccessToken(accessToken: string): Promise<GoogleUserPayload> {
    try {
      // ✅ FIXED: Type the response properly
      const response = await axios.get<GoogleUserInfo>(
        `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${accessToken}`
      );

      const userInfo = response.data;

      if (!userInfo.email) {
        throw new BadRequestException('Google account does not have an email');
      }

      // Extract name parts
      const fullName = userInfo.name || '';
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || 'User';
      const lastName = nameParts.slice(1).join(' ') || 'Google';

      return {
        googleId: userInfo.id,
        email: userInfo.email,
        name: firstName,
        lastName: lastName,
        profileImageUrl: userInfo.picture,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to verify Google access token: ' + error.message);
    }
  }

  private extractUserInfo(payload: TokenPayload): GoogleUserPayload {
    const fullName = payload.name || '';
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'Google';

    return {
      googleId: payload.sub,
      email: payload.email!,
      name: firstName,
      lastName: lastName,
      profileImageUrl: payload.picture,
    };
  }
}