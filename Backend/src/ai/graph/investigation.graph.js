'use strict';

const { StateGraph, START, END } = require('@langchain/langgraph');
const { InvestigationState } = require('./investigation.state');

const { loadIncidentNode } = require('./nodes/loadIncident.node');
const { plannerNode } = require('./nodes/planner.node');
const { investigatorNode } = require('./nodes/investigator.node');
const { correlateEvidenceNode } = require('./nodes/correlateEvidence.node');
const { verifierNode } = require('./nodes/verifier.node');
const { finalizeInvestigationNode } = require('./nodes/finalize.node');

/**
 * Builds the bounded LangGraph state machine for Re:COVER security investigations.
 *
 * Sequence:
 * START
 *   ↓
 * loadIncident
 *   ↓
 * planInvestigation (Planner Role)
 *   ↓
 * collectEvidence (Investigator Role + Tool Registry)
 *   ↓
 * correlateEvidence
 *   ↓
 * verifyConclusion (Verifier Role)
 *   ↓
 * finalizeInvestigation
 *   ↓
 * END
 *
 * Bounded loop protection: No uncontrolled while(true) loops. Single pass through
 * the investigation pipeline with explicit step limits.
 */
function createInvestigationGraph() {
  const workflow = new StateGraph(InvestigationState)
    .addNode('loadIncident', loadIncidentNode)
    .addNode('planInvestigation', plannerNode)
    .addNode('collectEvidence', investigatorNode)
    .addNode('correlateEvidence', correlateEvidenceNode)
    .addNode('verifyConclusion', verifierNode)
    .addNode('finalizeInvestigation', finalizeInvestigationNode)

    .addEdge(START, 'loadIncident')
    .addEdge('loadIncident', 'planInvestigation')
    .addEdge('planInvestigation', 'collectEvidence')
    .addEdge('collectEvidence', 'correlateEvidence')
    .addEdge('correlateEvidence', 'verifyConclusion')
    .addEdge('verifyConclusion', 'finalizeInvestigation')
    .addEdge('finalizeInvestigation', END);

  return workflow.compile();
}

const investigationGraph = createInvestigationGraph();

module.exports = {
  createInvestigationGraph,
  investigationGraph,
};

