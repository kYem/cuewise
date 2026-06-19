import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@cuewise/ui';

export const Basic = () => (
  <Card style={{ maxWidth: 360 }}>
    <CardHeader>
      <CardTitle>Today's Focus</CardTitle>
      <p className="text-secondary" style={{ fontSize: 14 }}>
        One task left — keep your momentum.
      </p>
    </CardHeader>
    <CardContent style={{ marginTop: 16 }}>
      <Button variant="primary">Start 25-min session</Button>
    </CardContent>
  </Card>
);

export const WithBadge = () => (
  <Card style={{ maxWidth: 360 }}>
    <CardHeader>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <CardTitle style={{ fontSize: 18 }}>Weekly goal</CardTitle>
        <Badge variant="success">On track</Badge>
      </div>
    </CardHeader>
    <CardContent style={{ marginTop: 12 }}>
      <p className="text-secondary" style={{ fontSize: 14 }}>
        You've completed 4 of 5 focus sessions this week.
      </p>
    </CardContent>
  </Card>
);
