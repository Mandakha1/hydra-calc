/**
 * Phase 12.5b — ChannelCreateDialog tests.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChannelCreateDialog } from "../dialogs/ChannelCreateDialog";

describe("ChannelCreateDialog — Phase 12.5b", () => {
  it("renders type radios + circuit checkboxes + DN field + length cue", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ChannelCreateDialog length_m={42.5} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByTestId("channel-create-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("channel-type-Л-4")).toBeInTheDocument();
    expect(screen.getByTestId("channel-type-Л-7")).toBeInTheDocument();
    expect(screen.getByTestId("channel-type-Л-9")).toBeInTheDocument();
    expect(screen.getByTestId("channel-type-custom")).toBeInTheDocument();
    expect(screen.getByText(/42\.5/)).toBeInTheDocument(); // length cue
  });

  it("default selection is Л-7 with 4 circuits (medium-branch convention)", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={10} onConfirm={onConfirm} onCancel={() => {}} />);
    const л7 = screen.getByTestId("channel-type-Л-7") as HTMLInputElement;
    expect(л7.checked).toBe(true);
    // 4 circuits should be checked by default (heating supply / return / DHW / DHW recirc)
    fireEvent.click(screen.getByTestId("channel-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: "Л-7",
        pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc"],
        defaultDn: 100,
      }),
    );
  });

  it("switching to Л-9 auto-selects all 5 recommended circuits", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={50} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByTestId("channel-type-Л-9"));
    fireEvent.click(screen.getByTestId("channel-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: "Л-9",
        pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      }),
    );
  });

  it("switching to Л-4 auto-selects only 2 recommended circuits", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={20} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByTestId("channel-type-Л-4"));
    fireEvent.click(screen.getByTestId("channel-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: "Л-4",
        pipeCircuits: ["heating_supply", "heating_return"],
      }),
    );
  });

  it("custom type shows width + height inputs + uses them in payload", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={15} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByTestId("channel-type-custom"));
    const widthInput = screen.getByTestId("channel-custom-width") as HTMLInputElement;
    const heightInput = screen.getByTestId("channel-custom-height") as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: "950" } });
    fireEvent.change(heightInput, { target: { value: "520" } });
    fireEvent.click(screen.getByTestId("channel-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: "custom",
        customWidth_mm: 950,
        customHeight_mm: 520,
      }),
    );
  });

  it("disables confirm when no circuits are selected", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={10} onConfirm={onConfirm} onCancel={() => {}} />);
    // Untick all 4 default circuits
    fireEvent.click(screen.getByTestId("circuit-heating_supply").querySelector("input")!);
    fireEvent.click(screen.getByTestId("circuit-heating_return").querySelector("input")!);
    fireEvent.click(screen.getByTestId("circuit-dhw_supply").querySelector("input")!);
    fireEvent.click(screen.getByTestId("circuit-dhw_recirc").querySelector("input")!);
    const confirm = screen.getByTestId("channel-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirm for invalid DN (zero or out of range)", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={10} onConfirm={onConfirm} onCancel={() => {}} />);
    const dn = screen.getByTestId("channel-default-dn") as HTMLInputElement;
    fireEvent.change(dn, { target: { value: "5" } }); // below min 15
    const confirm = screen.getByTestId("channel-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("cancel button invokes onCancel", () => {
    const onCancel = vi.fn();
    render(<ChannelCreateDialog length_m={10} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("channel-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("close X button also invokes onCancel", () => {
    const onCancel = vi.fn();
    render(<ChannelCreateDialog length_m={10} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText("Хаах"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("custom dimensions of 0 keep confirm disabled", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={10} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByTestId("channel-type-custom"));
    fireEvent.change(screen.getByTestId("channel-custom-width"), { target: { value: "0" } });
    const confirm = screen.getByTestId("channel-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("toggling an individual circuit updates the payload", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={10} onConfirm={onConfirm} onCancel={() => {}} />);
    // Default Л-7 has 4 circuits; add cold_water (У1) as 5th
    fireEvent.click(screen.getByTestId("circuit-cold_water").querySelector("input")!);
    fireEvent.click(screen.getByTestId("channel-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      }),
    );
  });

  it("custom DN value flows into payload", () => {
    const onConfirm = vi.fn();
    render(<ChannelCreateDialog length_m={10} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId("channel-default-dn"), { target: { value: "150" } });
    fireEvent.click(screen.getByTestId("channel-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ defaultDn: 150 }),
    );
  });
});
