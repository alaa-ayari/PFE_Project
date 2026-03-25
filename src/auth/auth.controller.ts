import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() createUserDto: CreateUserDto) {
    return this.authService.signup(createUserDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req, @Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.logout(req.user.userId, refreshTokenDto.refreshToken);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return {
      user: req.user,
    };
  }
  
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

@Post('reset-password')
async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
  return this.authService.resetPassword(resetPasswordDto.code, resetPasswordDto.newPassword);
}

  /**
   * Google Sign-In / Sign-Up endpoint
   * - For existing users: Links Google account and logs in
   * - For new users: Creates account with Google data (requires role)
   */
@Post('google')
async googleAuth(@Body() googleAuthDto: GoogleAuthDto) {
  return this.authService.googleAuth(
    googleAuthDto.idToken,
    googleAuthDto.accessToken,
    googleAuthDto.role
  );
}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async sendOtp(@Request() req, @Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(req.user.userId, sendOtpDto.phoneNumber);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async verifyOtp(@Request() req, @Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(
      req.user.userId,
      verifyOtpDto.phoneNumber,
      verifyOtpDto.code,
    );
  }

}
