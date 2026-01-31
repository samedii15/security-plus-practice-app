# Contributing to CyberAcademy

Thank you for your interest in contributing to CyberAcademy! We welcome contributions from everyone.

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm

### Local Setup
1. Clone the repository
   ```bash
   git clone https://github.com/samedii15/security-plus-practice-app.git
   cd security-plus-practice-app
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Initialize the database
   ```bash
   npm run migrate
   ```

5. Start the development server
   ```bash
   npm start
   ```

### Running Tests
```bash
npm test
```

## Development Guidelines

### Code Style
- Use consistent indentation (2 spaces)
- Follow JavaScript ES6+ conventions
- Add comments for complex logic
- Ensure all tests pass before submitting

### Commit Messages
- Use clear, descriptive commit messages
- Start with a verb in present tense (e.g., "Add", "Fix", "Update")
- Reference issues when applicable

### Pull Request Process
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Questions?

If you have questions about contributing, feel free to open an issue for discussion.