The floating panel every Cuewise screen is built from — rounded-2xl, soft shadow, hairline border. Use `frosted` over the gradient/photo, `hover` for interactive cards (quote library, lists).

```jsx
<Card>
  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Today's Focus</h2>
</Card>

<Card frosted radius="2xl" />
<Card hover padding="md" />
```

- **frosted**: translucent + blur. **radius**: `lg`/`xl`(default)/`2xl`. **padding**: `sm`–`xl`. **hover**: lifts 2px and deepens shadow.
