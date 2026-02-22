## Packages
date-fns | Needed for formatting and calculating past 7 days for the habit grid
react-hook-form | Required for building robust forms for habit creation/editing
@hookform/resolvers | Required for integrating Zod validation with React Hook Form
clsx | Utility for conditional class joining
tailwind-merge | Utility for merging tailwind classes without conflicts

## Notes
- Expecting pixel art fonts 'Silkscreen' and 'VT323' to be imported via CSS from Google Fonts.
- Using standard Lucide icons but heavily relying on custom CSS for the "retro 8-bit" aesthetic (hard drop shadows, thick borders).
- Dates are handled as YYYY-MM-DD strings to match the backend schema.
