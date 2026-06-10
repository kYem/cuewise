Pill switch for boolean settings. Controlled — pass `checked` and handle `onChange`.

```jsx
const [on, setOn] = React.useState(true);
<Toggle checked={on} onChange={setOn} />
```

- Track is `--color-border` off / `--color-primary-600` on; white knob slides with an ease-out.
- **size**: `sm` / `md`. Pair with a label + helper text in Settings rows.
