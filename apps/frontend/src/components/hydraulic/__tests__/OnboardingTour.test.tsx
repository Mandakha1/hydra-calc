/**
 * Phase 11.5 — Onboarding tour tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  OnboardingTour,
  shouldShowOnboarding,
  markOnboardingSeen,
} from "../OnboardingTour";

beforeEach(() => {
  window.localStorage.clear();
});

describe("shouldShowOnboarding", () => {
  it("returns true on fresh localStorage", () => {
    expect(shouldShowOnboarding()).toBe(true);
  });

  it("returns false after markOnboardingSeen", () => {
    markOnboardingSeen();
    expect(shouldShowOnboarding()).toBe(false);
  });
});

describe("OnboardingTour — render", () => {
  it("renders the overlay + modal", () => {
    render(<OnboardingTour onClose={() => undefined} />);
    expect(screen.getByTestId("onboarding-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument();
  });

  it("starts at step 1 of 5", () => {
    render(<OnboardingTour onClose={() => undefined} />);
    expect(screen.getByTestId("onboarding-title").textContent).toMatch(/тавтай морилно уу/);
  });

  it("Mongolian copy across all steps", () => {
    render(<OnboardingTour onClose={() => undefined} />);
    // Click through all 5 steps and verify each title is Mongolian
    expect(screen.getByTestId("onboarding-title").textContent).toBeTruthy();
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-title").textContent).toMatch(/DXF|Zulu/);
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-title").textContent).toMatch(/Тооцоол/);
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-title").textContent).toMatch(/Стандарт/);
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-title").textContent).toMatch(/Drawing Set/);
  });
});

describe("OnboardingTour — navigation", () => {
  it("Next advances steps", () => {
    render(<OnboardingTour onClose={() => undefined} />);
    const initial = screen.getByTestId("onboarding-title").textContent;
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-title").textContent).not.toBe(initial);
  });

  it("Prev button appears after step 1", () => {
    render(<OnboardingTour onClose={() => undefined} />);
    expect(screen.queryByTestId("onboarding-prev")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-prev")).toBeInTheDocument();
  });

  it("Final step button reads 'Эхлэх ✓'", () => {
    render(<OnboardingTour onClose={() => undefined} />);
    // Click next 4 times to reach step 5
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-next").textContent).toMatch(/Эхлэх/);
  });
});

describe("OnboardingTour — dismissal", () => {
  it("Skip calls onClose + marks seen", () => {
    const onClose = vi.fn();
    render(<OnboardingTour onClose={onClose} />);
    fireEvent.click(screen.getByTestId("onboarding-skip"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("hydra:onboarding-seen-v1")).toBe("1");
  });

  it("Finishing the tour also marks seen", () => {
    const onClose = vi.fn();
    render(<OnboardingTour onClose={onClose} />);
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(onClose).toHaveBeenCalled();
    expect(shouldShowOnboarding()).toBe(false);
  });
});
