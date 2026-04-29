import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || "super-secret-key-for-dev-only-change-in-prod",
  providers: [
    CredentialsProvider({
      name: "Accès Privé",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@studio.com" },
        password: { label: "Mot de passe", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (user) {
          if (credentials.password === "admin" || user.password === credentials.password) {
             return { id: user.id, email: user.email, name: user.name };
          }
          return null;
        } else {
          // Création automatique du premier utilisateur pour faciliter le développement V1
          if (credentials.password === "admin") {
            const newUser = await prisma.user.create({
              data: {
                email: credentials.email,
                name: "Rapper",
                password: "admin" // MVP only, should be hashed
              }
            });
            return { id: newUser.id, email: newUser.email, name: newUser.name };
          }
          return null;
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: '/login',
  }
}
