/**
 * Phase 12.5 — Integration tests for channel store actions.
 *
 * Covers addChannel / updateChannel / removeChannel atomic semantics
 * via the live zustand store. Channels live alongside pipes; deleting
 * a channel cascade-removes its contained pipes by default (engineer's
 * mental model: "the trench going away takes its contents with it").
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";
import { buildChannelFromDraw } from "../scheme/channelOperations";
import { undo, redo } from "../scheme/undoStack";
import type { SchemeChannel, SchemePipe } from "../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("channel store actions — Phase 12.5", () => {
  it("addChannel inserts channel + pipes atomically", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"],
      length_m: 30,
    });

    useHydraulicStore.getState().addChannel(channel, pipes);

    const after = useHydraulicStore.getState();
    expect(after.channels).toHaveLength(1);
    expect(after.channels![0]!.id).toBe(channel.id);
    expect(after.pipes).toHaveLength(3);
    expect(after.pipes.every((p) => p.channelId === channel.id)).toBe(true);
  });

  it("updateChannel patches the channel row only", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 25,
    });
    useHydraulicStore.getState().addChannel(channel, pipes);

    useHydraulicStore.getState().updateChannel(channel.id, {
      channelType: "Л-7",
      crossSectionWidth_mm: 1200,
      crossSectionHeight_mm: 580,
    });

    const after = useHydraulicStore.getState();
    expect(after.channels![0]!.channelType).toBe("Л-7");
    expect(after.channels![0]!.crossSectionWidth_mm).toBe(1200);
    expect(after.channels![0]!.crossSectionHeight_mm).toBe(580);
    // Pipes untouched
    expect(after.pipes).toHaveLength(2);
  });

  it("removeChannel default cascades the pipes", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      length_m: 50,
    });
    useHydraulicStore.getState().addChannel(channel, pipes);
    expect(useHydraulicStore.getState().pipes).toHaveLength(5);

    useHydraulicStore.getState().removeChannel(channel.id);

    const after = useHydraulicStore.getState();
    expect(after.channels).toEqual([]);
    expect(after.pipes).toEqual([]);
  });

  it("removeChannel with keepPipes preserves pipes + clears channelId", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 20,
    });
    useHydraulicStore.getState().addChannel(channel, pipes);

    useHydraulicStore.getState().removeChannel(channel.id, { keepPipes: true });

    const after = useHydraulicStore.getState();
    expect(after.channels).toEqual([]);
    expect(after.pipes).toHaveLength(2);
    expect(after.pipes.every((p) => p.channelId === undefined)).toBe(true);
  });

  it("addChannel pushes ONE undo snapshot for the whole atomic op", () => {
    const before = useHydraulicStore.getState().undoStack?.length ?? 0;
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"],
      length_m: 30,
    });
    useHydraulicStore.getState().addChannel(channel, pipes);
    const after = useHydraulicStore.getState().undoStack?.length ?? 0;
    expect(after - before).toBe(1);
  });

  it("Ctrl+Z restores the pre-addChannel state (channel + pipes both gone)", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 15,
    });
    useHydraulicStore.getState().addChannel(channel, pipes);
    expect(useHydraulicStore.getState().channels).toHaveLength(1);

    undo();

    const after = useHydraulicStore.getState();
    expect(after.channels).toEqual([]);
    expect(after.pipes).toEqual([]);
  });

  it("Ctrl+Y after Ctrl+Z replays the channel insertion", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 20,
    });
    useHydraulicStore.getState().addChannel(channel, pipes);
    undo();
    redo();

    const after = useHydraulicStore.getState();
    expect(after.channels).toHaveLength(1);
    expect(after.pipes).toHaveLength(2);
    expect(after.pipes.every((p) => p.channelId === channel.id)).toBe(true);
  });

  it("removeChannel clears selection when the channel was selected", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 20,
    });
    useHydraulicStore.getState().addChannel(channel, pipes);
    // Simulate selection via raw setState (no dedicated channel SelectionKind yet)
    useHydraulicStore.setState({
      selection: { kind: "pipe", id: channel.id } as any,
    });
    useHydraulicStore.getState().removeChannel(channel.id);
    expect(useHydraulicStore.getState().selection).toBeNull();
  });

  it("multiple channels coexist without cross-contamination", () => {
    const draw1 = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 20,
    });
    const draw2 = buildChannelFromDraw({
      fromNodeId: "n2",
      toNodeId: "n3",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"],
      length_m: 40,
    });
    useHydraulicStore.getState().addChannel(draw1.channel, draw1.pipes);
    useHydraulicStore.getState().addChannel(draw2.channel, draw2.pipes);

    expect(useHydraulicStore.getState().channels).toHaveLength(2);
    expect(useHydraulicStore.getState().pipes).toHaveLength(5);

    // Removing one leaves the other intact
    useHydraulicStore.getState().removeChannel(draw1.channel.id);
    const after = useHydraulicStore.getState();
    expect(after.channels).toHaveLength(1);
    expect(after.channels![0]!.id).toBe(draw2.channel.id);
    expect(after.pipes).toHaveLength(3);
    expect(after.pipes.every((p) => p.channelId === draw2.channel.id)).toBe(true);
  });
});
