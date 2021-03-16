const request = require('./request');

class Gitlab {
    constructor(url, privateToken, sudo) {
        this.url = url;
        this.privateToken = privateToken;
        this.sudo = sudo;
        this.issueMatchCache = {};
    }

    async createMilestone(title, dueDate) {
        try {
            try {
                const headers = {
                    "Private-Token": this.privateToken,
                    "Content-Type": "application/json",
                    "Sudo": this.sudo
                }
                const url = `${this.url}/api/v4/groups/2/milestones`
                await request.POST(url, headers, {
                    title: title,
                    due_date: dueDate

                });
            } catch (e) {
                console.error(`Unable to create milestone`);
            }
        } catch (e) {
            console.warn(`Issue ${jiraIssueCode} not found`);
        }
    }
    async getMilestones() {
        try {
            const headers = {
                "Private-Token": this.privateToken,
                "Content-Type": "application/json"
            }
            const url = `${this.url}/api/v4/groups/2/milestones?per_page=9999999`
            return await request.GET(url, headers);
        } catch (e) {
            console.error(`Unable to get milestones`);
        }
    }

    async editIssue(jiraIssueCode, params) {
        try {
            const issue = await gitlab.findIssue(jiraIssueCode);
            try {
                const headers = {
                    "Private-Token": this.privateToken,
                    "Content-Type": "application/json",
                    "Sudo": this.sudo
                }
                const url = `${this.url}/api/v4/projects/${issue["project_id"]}/issues/${issue["iid"]}`
                await request.PUT(url, headers, params);
            } catch (e) {
                console.error(`Unable to edit ${jiraIssueCode} with ${JSON.stringify(params)}`);
                console.error(e);
            }
        } catch (e) {
            console.warn(`Issue ${jiraIssueCode} not found`);
            console.warn(e);
        }
    }

    async findIssue(jiraIssueCode) {
        if (!!this.issueMatchCache[jiraIssueCode]) {
            return this.issueMatchCache[jiraIssueCode];
        }
        const headers = {
            "Private-Token": this.privateToken
        }
        const issues = await request.GET(`${this.url}/api/v4/groups/2/issues?search="[${jiraIssueCode}] "`, headers);
        const match = issues.find((issue) => {
            return issue.title.startsWith(`[${jiraIssueCode}]`);
        }) || null;

        if (!match) {
            console.error({
                message: `Unable to find issue ${jiraIssueCode}`
            });
            return null;
        }

        this.issueMatchCache[jiraIssueCode] = match;

        return match;
    }

    async addNotes(jiraIssueCode, comments) {
        try {
            const issue = await gitlab.findIssue(jiraIssueCode);
            const ticketNotes = await gitlab.getNotes(jiraIssueCode);
            const existingNotes = (ticketNotes || []).map(note => note.body);
            if (existingNotes.length === 0) {
                return;
            }

            try {
                comments.forEach(async (comment) => {
                    const authorUsername = config.jiraToGitlab.user[comment.author.name] || "henchman";
                    let message = comment.body;
                    const headers = {
                        "Private-Token": this.privateToken,
                        "Content-Type": "application/json",
                        "Sudo": authorUsername
                    }
                    if (authorUsername === "henchman") {
                        message = `${comment.author.displayName} said:\n> ${message}`;
                    }
                    if (!existingNotes.includes(message)) {
                        const url = `${this.url}/api/v4/projects/${issue["project_id"]}/issues/${issue["iid"]}/notes`
                        try {
                            await request.POST(url, headers, {
                                body: message,
                                "created_at": (comment.created || "").split(".")[0] + "Z"
                            });
                        } catch (e) {
                            console.error(`Unable to add comment to ${jiraIssueCode}`);
                            console.error(e);
                        }
                    }
                });
            } catch (e) {
                console.error(`Unable to add comment to ${jiraIssueCode}`);
            }
        } catch (e) {
            console.warn(`Issue ${jiraIssueCode} not found`);
        }
    }

    async getNotes(jiraIssueCode) {
        try {
            const issue = await gitlab.findIssue(jiraIssueCode);
            const headers = {
                "Private-Token": this.privateToken,
                "Content-Type": "application/json",
            }
            const url = `${this.url}/api/v4/projects/${issue["project_id"]}/issues/${issue["iid"]}/notes`
            try {
                return await request.GET(url, headers);
            } catch (e) {
                console.error(`Unable to get comments for ${jiraIssueCode}`);
                console.error(e);
            }
        } catch (e) {
            console.warn(`Issue ${jiraIssueCode} not found`);
            console.warn(e);
        }
    }

    async deleteNote(jiraIssueCode, id) {
        try {
            const issue = await gitlab.findIssue(jiraIssueCode);
            const headers = {
                "Private-Token": this.privateToken,
                "Content-Type": "application/json",
            }
            const url = `${this.url}/api/v4/projects/${issue["project_id"]}/issues/${issue["iid"]}/notes/${id}`
            try {
                return await request.DELETE(url, headers);
            } catch (e) {
                console.error(`Unable to delete comments for ${jiraIssueCode}`);
                console.error(e);
            }
        } catch (e) {
            console.warn(`Issue ${jiraIssueCode} not found`);
            console.warn(e);
        }
    }

    async addMilestone(jiraIssueCode, milestoneId) {
        await gitlab.editIssue(jiraIssueCode, {
            "milestone_id": milestoneId
        });
    }

    async addLabels(jiraIssueCode, labels) {
        await gitlab.editIssue(jiraIssueCode, {
            "add_labels": labels
        });
    }

    async setAssignees(jiraIssueCode, assignees) {
        await gitlab.editIssue(jiraIssueCode, {
            "assignee_ids": assignees
        });
    }
}

module.exports = Gitlab;