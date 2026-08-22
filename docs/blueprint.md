# **App Name**: TwelveLabs Voice Studio

## Core Features:

- Character Definition AI Tool: Uses AI to analyze the script and identify characters, inferring their gender, age, and emotion for voice selection. This tool delivers information on the characters found to the Assign Voices and the Dialogue Enhancement AI tool. Uses Gemini models to extract features from text.
- Text-to-Speech (TTS) AI Tool: Generates high-quality audio from text using Google's TTS model, with credit deduction based on the number of characters. Rewrites a line of dialog to match a given emotion. Provides audio as a base64-encoded data URI.
- User Authentication & Role Management: Controls access to the dashboard and admin panel based on user roles stored in Firestore. Uses Firebase for login
- Admin Panel: A secure interface for managing users and their credits. Accessible only to users with the 'admin' role, for actions such as creation, and modification of credits.
- Credit Management: Each new user should start with 2,000 credits and a charge for character generated using the AI.  Managed in Firestore.
- Voice Generation UI: Allows users to paste/upload scripts, assign voices to characters, edit dialogue, and generate/download audio. Integrates AI and provides an edit UI.
- File management for upload and downloads: Enables users to upload scripts from .txt and .docx files, and download results in various formats, including individual .wav files, merged audio, and .zip archives. Handles audio for individual lines, a single merged audio file or a zipped file for multiple generated clips.

## Style Guidelines:

- Primary color: Deep blue (#1A237E) to evoke a sense of technology and professionalism.
- Background color: Dark gray (#212121) for a futuristic dark theme.
- Accent color: Purple (#9C27B0) to complement the primary blue and add a touch of creativity.
- Body font: 'Inter' (sans-serif) for clean and readable text.
- Headline font: 'Pacifico' (sans-serif) for display and logo with a unique, futuristic flair.
- Code font: 'Source Code Pro' (monospace) for displaying code snippets, ensuring clarity and distinction.
- Use sleek, minimalist icons that fit with the modern dark theme. Provide clear icons and loading/error message toasts
- The application should be fully responsive and work on both desktop and mobile devices, ensuring a seamless user experience across platforms.
- Loading states with subtle, futuristic animations.