import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView — mock it so components that call it
// don't crash during tests.
window.HTMLElement.prototype.scrollIntoView = () => {}
