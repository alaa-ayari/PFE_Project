import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './config/email.module';
import config from './config/config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { CasesModule } from './cases/cases.module';
import { PropertyModule } from './property/property.module';
import { LawyersModule } from './lawyers/lawyers.module';


  @Module({
    imports: [EmailModule, ConfigModule.forRoot({
      isGlobal:true,
      cache:true,
      load:[config]
    }),
    MongooseModule.forRootAsync({ 
      imports:[ConfigModule],
      useFactory:async(configService:ConfigService)=>({
          uri: configService.get<string>('database.connectionString'),
      }),
      inject:[ConfigService]


    }),
    JwtModule.registerAsync({
      global: true, 
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('jwt.secret');
        
        if (!secret) {
          throw new Error('JWT_SECRET is not defined in environment variables');
        }
        return {
          secret: secret,
          signOptions: { 
            expiresIn: configService.get<string>('jwt.expiresIn') || '1h'
          },
        } as JwtModuleOptions;
      },
      inject: [ConfigService],
    })

      ,AuthModule, UsersModule, CasesModule, PropertyModule, LawyersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
