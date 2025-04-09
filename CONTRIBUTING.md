# Contributing to StemTubes Web

Thank you for your interest in contributing to StemTubes Web! This project aims to create a powerful web application for extracting and mixing stems from YouTube videos.

## Priority Improvements Needed

We're currently seeking help with specific mixer interface improvements:

### Timeline & Playback Improvements

1. **Timeline Graduation & Synchronization**
   - Improve time markers to scale properly with zoom levels
   - Fix synchronization between playhead and audio playback
   - Ensure timestamps remain visible and meaningful at all zoom levels

2. **Waveform Display & Interaction**
   - Fix rendering issues where waveform ends don't appear when zoomed
   - Ensure complete waveform visibility at all zoom levels
   - Make playhead/timeline fully responsive to user interaction

3. **Advanced Features**
   - Implement loop region selection directly on waveforms
   - Add horizontal autoscroll during playback
   - Improve seeking accuracy when clicking on the timeline

## Key Files

```
templates/mixer.html          # Main HTML structure
static/js/mixer/core.js       # Core mixer functionality
static/js/mixer/timeline.js   # Timeline implementation
static/js/mixer/waveform.js   # Waveform visualization
static/js/mixer/audio-engine.js # Audio playback handling
static/css/mixer/mixer.css    # Mixer styling
```

## Contribution Workflow

### Setup

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR-USERNAME/StemTubesWeb.git
   cd StemTubesWeb
   ```

2. **Create Branch & Install**
   ```bash
   git checkout -b feature/your-feature-name
   pip install -r requirements.txt
   python app.py  # Run the application
   ```

### Development Guidelines

- **Code Quality**: Follow existing style, add comments for complex logic
- **Testing**: Test thoroughly in multiple browsers before submitting
- **Commits**: Make focused commits with clear messages (e.g., `"Fix timeline graduation #42"`)

### Submitting Changes

1. Push to your fork: `git push origin feature/your-feature-name`
2. Create a Pull Request against the `dev` branch (not `main`)
3. Wait for code review and address any feedback
4. Once approved, your PR will be merged

## Technical Implementation Details

### Timeline & Waveform System

The mixer uses HTML5 canvas for both timeline (`timeline.js`) and waveforms (`waveform.js`). Main challenges include:

- **Accurate Rendering**: Ensuring waveforms render completely at any zoom level
- **Synchronization**: Keeping timeline, playhead and audio in sync
- **Performance**: Efficient rendering of waveform data at different resolutions
- **Interactivity**: Handling user interactions for seeking and loop selection

The audio engine (`audio-engine.js`) must integrate precisely with these visual elements to provide seamless playback control.

## Communication

- Use **GitHub Issues** for bug reports and feature discussions
- Use **Pull Requests** for code submissions

Thanks for helping improve StemTubes Web!
