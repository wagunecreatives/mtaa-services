# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Supabase phone verification

New accounts provide a phone number in international format (for example, `+254712345678`) and verify it by SMS after confirming their email and signing in. Supabase Auth generates the six-digit OTP. The local Supabase configuration sets a 60-second resend interval.

For Supabase projects, configure an SMS provider under **Authentication → Providers → Phone**, enable phone confirmations, set the SMS OTP expiry to **300 seconds**, and set the SMS send interval to at least **60 seconds**. The installed local Supabase CLI version does not expose the SMS OTP expiry setting in `config.toml`, so set it in the hosted project's Auth settings; the SMS provider must also be configured before signup verification can deliver codes. Apply the repository migrations before using signup or provider onboarding.

Provider accounts are selected at signup. After phone verification, providers complete their business, service, and area setup; the profile is activated without administrator approval.

Customer service requests can include up to three optional JPEG, PNG, or WebP photos (5 MB each). The `service-request-photos` private Supabase Storage bucket and participant-only photo access are configured by the service-request-photos migration.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
