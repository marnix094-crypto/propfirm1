import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from '../button';
import { Stepper } from '../stepper';
import { Meter } from '../meter';
import { Accordion, AccordionItem } from '../accordion';

const stateLabels = { safe: 'Safe', warn: 'Near limit', breach: 'Breached' };

describe('Button', () => {
  it('defaults to type=button and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toHaveAttribute('type', 'button');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders as child element', () => {
    render(
      <Button asChild>
        <a href="/x">Link</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Link' })).toHaveClass('btn-primary');
  });
});

function StepperHarness() {
  const [v, setV] = useState(1);
  return (
    <Stepper
      value={v}
      onChange={setV}
      min={1}
      max={3}
      label="Qty"
      decrementLabel="Less"
      incrementLabel="More"
    />
  );
}

describe('Stepper', () => {
  it('increments, clamps to max and disables buttons at bounds', async () => {
    render(<StepperHarness />);
    const input = screen.getByLabelText('Qty');
    const less = screen.getByRole('button', { name: 'Less' });
    const more = screen.getByRole('button', { name: 'More' });
    expect(less).toBeDisabled();
    await userEvent.click(more);
    await userEvent.click(more);
    await userEvent.click(more);
    expect(input).toHaveValue(3);
    expect(more).toBeDisabled();
    expect(less).toBeEnabled();
  });
});

describe('Meter', () => {
  it.each([
    [100n, 'Safe'],
    [400n, 'Near limit'],
    [500n, 'Breached'],
  ])('used %s of 500 shows "%s" with text, not colour only', (used, label) => {
    render(
      <Meter
        label="Daily loss"
        used={used}
        limit={500n}
        usedLabel="u"
        limitLabel="l"
        stateLabels={stateLabels}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Daily loss' })).toHaveAttribute(
      'aria-valuetext',
      `u / l — ${label}`,
    );
  });
});

describe('Accordion', () => {
  it('toggles with keyboard', async () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a" question="Question?">
          Answer.
        </AccordionItem>
      </Accordion>,
    );
    const trigger = screen.getByRole('button', { name: /Question\?/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Answer.')).toBeVisible();
  });
});
